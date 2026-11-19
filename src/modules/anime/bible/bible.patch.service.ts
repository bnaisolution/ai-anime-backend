import { createHash, randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { applyBibleEntities, hasBibleEntities, normalizeBibleEntities, type BibleEntities } from './bible.entities.service';

const PATCH_ACTION_TYPE = 'BIBLE_PATCH';
const PENDING_STATUSES = ['PATCH_READY', 'PENDING_APPROVAL'];
const TERMINAL_STATUSES = ['APPLIED', 'REJECTED', 'EXPIRED'];
const PROTECTED_KEYS = new Set([
  'id', 'project_id', 'user_id', 'owner_id', 'budget_ceiling', 'auto_approve',
  'active_system_prompt_id', 'cover_image_url', 'vision_provider', 'created_at',
  'genre', 'visual_medium', 'updated_at'
]);
const MAX_FIELDS = 80;
const MAX_PAYLOAD_BYTES = 256 * 1024;

export interface BiblePatchRecord {
  id: string;
  draft_id: string;
  project_id: string;
  command_id: string | null;
  status: string;
  base_hash: string;
  base_version: number;
  fields: Record<string, unknown>;
  entities: BibleEntities;
  summary: string;
  created_at: string;
  expires_at: string | null;
  error: string | null;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function hashStoryBible(value: unknown): string {
  return createHash('sha256').update(stableStringify(value ?? {})).digest('hex');
}

export function normalizePatchFields(raw: unknown, options?: { allowEmpty?: boolean }): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Bible patch fields must be a JSON object.' });
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0 && options?.allowEmpty !== true) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Bible patch contains no changes.' });
  }
  if (entries.length > MAX_FIELDS) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Bible patch contains too many fields.' });
  }
  const fields: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (!key || key.length > 80 || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `Invalid Bible patch field: ${key}` });
    }
    if (PROTECTED_KEYS.has(key)) {
      throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `Protected field cannot be patched: ${key}` });
    }
    fields[key] = value;
  }
  if (Buffer.byteLength(JSON.stringify(fields), 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Bible patch is too large.' });
  }
  return fields;
}

function entityCounts(entities: BibleEntities): Record<string, number> {
  return Object.fromEntries(Object.entries(entities).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]));
}

function mapPatch(row: any): BiblePatchRecord {
  const payload = (row?.action_payload && typeof row.action_payload === 'object') ? row.action_payload : {};
  return {
    id: String(row.id),
    draft_id: String(row.id),
    project_id: String(row.project_id),
    command_id: payload.command_id ? String(payload.command_id) : null,
    status: String(row.status || 'PATCH_READY').toUpperCase(),
    base_hash: String(payload.base_hash || ''),
    base_version: Number(payload.base_version || 0),
    fields: (payload.fields && typeof payload.fields === 'object') ? payload.fields : {},
    entities: normalizeBibleEntities(payload.entities),
    summary: String(payload.summary || 'AI Story Bible update'),
    created_at: String(row.created_at || ''),
    expires_at: row.expires_at ? String(row.expires_at) : null,
    error: row.last_error ? String(row.last_error) : null,
  };
}

export async function persistBiblePatchFromCallback(input: {
  project_id: string;
  command_id: string | null;
  callback: any;
  request_id?: string;
}): Promise<BiblePatchRecord | null> {
  const result = input.callback?.result;
  if (!result || typeof result !== 'object') return null;
  const status = String(result.status || '').toUpperCase();
  const patch = result.patch;
  if (status !== 'PATCH_READY' || !patch || typeof patch !== 'object') return null;
  const entities = normalizeBibleEntities(patch.entities);
  const fields = normalizePatchFields(patch.fields, { allowEmpty: hasBibleEntities(entities) });
  const summary = String(patch.summary || result.output || 'AI Story Bible update').slice(0, 500);
  const { data: project, error: projectError } = await animeSupabase
    .from('projects')
    .select('id, user_id, story_bible')
    .eq('id', input.project_id)
    .maybeSingle();
  if (projectError || !project) {
    throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Project not found for Bible patch.', cause: projectError });
  }
  const currentBible = (project.story_bible && typeof project.story_bible === 'object') ? project.story_bible : {};
  const baseHash = String(patch.base_hash || '').trim() || hashStoryBible(currentBible);
  const baseVersion = Number(patch.base_version || 0) || 0;

  if (input.command_id) {
    const { data: existing } = await animeSupabase
      .from('pending_actions')
      .select('*')
      .eq('project_id', input.project_id)
      .eq('action_type', PATCH_ACTION_TYPE)
      .eq('idempotency_key', input.command_id)
      .maybeSingle();
    if (existing) return mapPatch(existing);
  }

  const patchId = randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const actionPayload = {
    command_id: input.command_id,
    base_hash: baseHash,
    base_version: baseVersion,
    fields,
    entities,
    summary,
  };
  const { data: inserted, error: insertError } = await animeSupabase
    .from('pending_actions')
    .insert({
      id: patchId,
      project_id: input.project_id,
      session_id: input.command_id,
      action_type: PATCH_ACTION_TYPE,
      action_payload: actionPayload,
      status: 'PATCH_READY',
      priority: 10,
      idempotency_key: input.command_id,
      mode: 'SAVE',
      review_type: 'BIBLE_PATCH',
      expires_at: expiresAt,
    })
    .select('*')
    .single();
  if (insertError || !inserted) {
    throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to store Bible patch.', cause: insertError });
  }

  await animeSupabase.from('approval_decisions').insert({
    project_id: input.project_id,
    type: 'BIBLE_PATCH',
    resource_id: patchId,
    resource_version: baseVersion + 1,
    requested_by: String(project.user_id || 'system'),
    approver_role: 'owner',
    exact_diff: { fields, summary, base_hash: baseHash },
    risk: 'MEDIUM',
    status: 'PENDING',
    expires_at: expiresAt,
  });
  await writeAudit({
    project_id: input.project_id,
    user_id: String(project.user_id || 'system'),
    workflow_name: 'WF-01',
    action: 'BIBLE_PATCH_READY',
    entity_type: 'PENDING_ACTION',
    entity_id: patchId,
    new_value: { command_id: input.command_id, fields: Object.keys(fields), entities: entityCounts(entities), base_hash: baseHash },
    request_id: input.request_id,
  });
  return mapPatch(inserted);
}

export async function listBiblePatches(projectId: string): Promise<BiblePatchRecord[]> {
  const { data, error } = await animeSupabase
    .from('pending_actions')
    .select('*')
    .eq('project_id', projectId)
    .eq('action_type', PATCH_ACTION_TYPE)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to load Bible patches.', cause: error });
  return (data ?? []).map(mapPatch);
}

async function loadPendingPatch(projectId: string, patchId: string) {
  const { data, error } = await animeSupabase
    .from('pending_actions')
    .select('*')
    .eq('project_id', projectId)
    .eq('id', patchId)
    .eq('action_type', PATCH_ACTION_TYPE)
    .maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to load Bible patch.', cause: error });
  if (!data) throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Bible patch not found.' });
  return data;
}

async function updateApproval(projectId: string, patchId: string, status: 'APPROVED' | 'REJECTED', userId: string, reason: string) {
  const now = new Date().toISOString();
  await animeSupabase
    .from('approval_decisions')
    .update({ status, decision: status, decision_by: userId, decision_reason: reason, decided_at: now, updated_at: now })
    .eq('project_id', projectId)
    .eq('resource_id', patchId)
    .eq('type', 'BIBLE_PATCH')
    .eq('status', 'PENDING');
}

export async function approveBiblePatch(input: {
  project_id: string;
  patch_id: string;
  user_id: string;
  expected_base_hash?: string;
  request_id?: string;
}): Promise<BiblePatchRecord> {
  const row = await loadPendingPatch(input.project_id, input.patch_id);
  const status = String(row.status || '').toUpperCase();
  if (status === 'APPLIED') throw new AnimeError({ code: AnimeErrorCode.VERSION_CONFLICT, httpStatus: 409, message: 'This Bible patch is already applied.' });
  if (status === 'REJECTED' || status === 'EXPIRED') throw new AnimeError({ code: AnimeErrorCode.VERSION_CONFLICT, httpStatus: 409, message: 'This Bible patch can no longer be applied.' });
  if (!PENDING_STATUSES.includes(status)) throw new AnimeError({ code: AnimeErrorCode.VERSION_CONFLICT, httpStatus: 409, message: 'This Bible patch is not awaiting approval.' });
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    await animeSupabase.from('pending_actions').update({ status: 'EXPIRED', last_error: 'Patch expired', updated_at: new Date().toISOString() }).eq('id', row.id);
    throw new AnimeError({ code: AnimeErrorCode.VERSION_CONFLICT, httpStatus: 409, message: 'This Bible patch has expired.' });
  }

  const { data: project, error: projectError } = await animeSupabase
    .from('projects')
    .select('id, story_bible, current_season')
    .eq('id', input.project_id)
    .maybeSingle();
  if (projectError || !project) throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Project not found.', cause: projectError });
  const currentBible = (project.story_bible && typeof project.story_bible === 'object') ? project.story_bible : {};
  const currentHash = hashStoryBible(currentBible);
  const queued = mapPatch(row);
  const expected = String(input.expected_base_hash || queued.base_hash || '').trim();
  if (expected && expected !== currentHash) {
    await animeSupabase.from('pending_actions').update({ status: 'CONFLICT', last_error: 'Base Bible changed after patch preview', updated_at: new Date().toISOString() }).eq('id', row.id);
    await updateApproval(input.project_id, row.id, 'REJECTED', input.user_id, 'Stale patch rejected');
    throw new AnimeError({ code: AnimeErrorCode.VERSION_CONFLICT, httpStatus: 409, message: 'Story Bible changed after this preview. Generate a fresh preview.' });
  }

  const fields = normalizePatchFields(queued.fields, { allowEmpty: hasBibleEntities(queued.entities) });
  const now = new Date().toISOString();
  const mergedBible = {
    ...currentBible,
    ...fields,
    bible_approved_at: now,
    bible_approved_by: input.user_id,
  };
  const { data: updated, error: updateError } = await animeSupabase
    .from('projects')
    .update({ story_bible: mergedBible })
    .eq('id', input.project_id)
    .eq('story_bible', currentBible)
    .select('id, story_bible')
    .maybeSingle();
  if (updateError || !updated) {
    await animeSupabase.from('pending_actions').update({ status: 'CONFLICT', last_error: 'Concurrent Bible update detected', updated_at: now }).eq('id', row.id);
    throw new AnimeError({ code: AnimeErrorCode.VERSION_CONFLICT, httpStatus: 409, message: 'Concurrent Story Bible update detected. Reload and preview again.', cause: updateError });
  }

  let entityCountsApplied: Record<string, number>;
  try {
    entityCountsApplied = await applyBibleEntities(input.project_id, queued.entities);
  } catch (entityError) {
    await animeSupabase
      .from('projects')
      .update({ story_bible: currentBible })
      .eq('id', input.project_id)
      .eq('story_bible', mergedBible);
    await animeSupabase
      .from('pending_actions')
      .update({ status: PENDING_STATUSES[0], last_error: 'Entity persistence failed; Bible row rolled back', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    throw new AnimeError({
      code: AnimeErrorCode.INTERNAL,
      message: 'Story Bible entities could not be persisted. No Bible fields were applied; retry the preview.',
      cause: entityError,
    });
  }

  await animeSupabase.from('bible_versions').insert({
    project_id: input.project_id,
    season_no: Number(project.current_season || 1),
    episode_no: 0,
    bible_snapshot: mergedBible,
    change_summary: `AI patch approved: ${queued.summary}`.slice(0, 500),
  });
  await animeSupabase.from('pending_actions').update({ status: 'APPLIED', last_error: null, updated_at: now }).eq('id', row.id);
  await updateApproval(input.project_id, row.id, 'APPROVED', input.user_id, 'Approved from Story Bible preview');
  await writeAudit({
    project_id: input.project_id,
    user_id: input.user_id,
    workflow_name: 'BIBLE_PATCH',
    action: 'BIBLE_PATCH_APPLIED',
    entity_type: 'PENDING_ACTION',
    entity_id: row.id,
    new_value: { fields: Object.keys(fields), entities: entityCountsApplied, base_hash: queued.base_hash },
    request_id: input.request_id,
  });
  return { ...queued, status: 'APPLIED', fields };
}

export async function rejectBiblePatch(input: {
  project_id: string;
  patch_id: string;
  user_id: string;
  reason?: string;
  request_id?: string;
}): Promise<BiblePatchRecord> {
  const row = await loadPendingPatch(input.project_id, input.patch_id);
  const status = String(row.status || '').toUpperCase();
  if (TERMINAL_STATUSES.includes(status)) {
    if (status === 'REJECTED') return mapPatch(row);
    throw new AnimeError({ code: AnimeErrorCode.VERSION_CONFLICT, httpStatus: 409, message: 'This Bible patch can no longer be rejected.' });
  }
  const now = new Date().toISOString();
  await animeSupabase.from('pending_actions').update({ status: 'REJECTED', last_error: input.reason || null, updated_at: now }).eq('id', row.id);
  await updateApproval(input.project_id, row.id, 'REJECTED', input.user_id, input.reason || 'Rejected from Story Bible preview');
  await writeAudit({
    project_id: input.project_id,
    user_id: input.user_id,
    workflow_name: 'BIBLE_PATCH',
    action: 'BIBLE_PATCH_REJECTED',
    entity_type: 'PENDING_ACTION',
    entity_id: row.id,
    reason: input.reason,
    request_id: input.request_id,
  });
  return { ...mapPatch(row), status: 'REJECTED' };
}
