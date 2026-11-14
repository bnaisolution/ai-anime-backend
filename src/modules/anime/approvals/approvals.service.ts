import { randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { clampLimit, type CursorPage, type CursorPaginationInput } from '../reads/reads.types';
import { type ApprovalRecord, ApprovalStatus, ApprovalType, RESTRICTED_APPROVAL_TYPES } from './approvals.types';
import { insertCommandAtomic } from '../commands/commands.repo';
export async function listApprovals(projectId: string, options: CursorPaginationInput & { status?: ApprovalStatus }): Promise<CursorPage<ApprovalRecord>> {
  const limit = clampLimit(options.limit);
  let query = animeSupabase.from('approval_decisions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit + 1);
  if (options.status) query = query.eq('status', options.status);
  if (options.cursor) query = query.lt('created_at', options.cursor);
  const { data, error } = await query;
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'List failed', cause: error });
  const rows = (data ?? []) as ApprovalRecord[]; const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore && items.length > 0 ? items[items.length - 1].created_at : null };
}
export async function createCanonApproval(input: { project_id: string, resource_id: string, requested_by: string, reason?: string, proposed_changes?: any }): Promise<ApprovalRecord> {
  // Prevent duplicate: if a PENDING approval already exists for this project+resource, return it
  const { data: existingPending } = await animeSupabase.from('approval_decisions').select('*').eq('project_id', input.project_id).eq('resource_id', input.resource_id).eq('status', ApprovalStatus.PENDING).maybeSingle<ApprovalRecord>();
  if (existingPending !== null && existingPending !== undefined) {
    return existingPending;
  }
  const { data, error } = await animeSupabase.from('approval_decisions').insert({
    project_id: input.project_id,
    type: ApprovalType.CANON_CHANGE,
    resource_id: input.resource_id,
    resource_version: 1,
    status: ApprovalStatus.PENDING,
    requested_by: input.requested_by,
    approver_role: 'owner',
    exact_diff: input.proposed_changes ?? {},
    risk: 'MEDIUM',
    cost_ceiling: null,
    expires_at: null,
  }).select('*').single();
  if (error !== null) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Create approval failed', cause: error });
  return data as ApprovalRecord;
}
export async function decideApproval(input: { project_id: string, approval_id: string, decision: ApprovalStatus.APPROVED | ApprovalStatus.REJECTED, expected_resource_version: number, reason: string, actor_user_id: string, request_id: string }): Promise<ApprovalRecord> {
  const { data: existing, error: fetchError } = await animeSupabase.from('approval_decisions').select('*').eq('project_id', input.project_id).eq('id', input.approval_id).maybeSingle<ApprovalRecord>();
  if (fetchError !== null) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Fetch failed', cause: fetchError });
  if (existing === null) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Not found.' });
  if (existing.status !== ApprovalStatus.PENDING) throw new AnimeError({ code: AnimeErrorCode.VERSION_CONFLICT, httpStatus: 409, message: 'Already decided.' });
  if (existing.resource_version !== input.expected_resource_version) throw new AnimeError({ code: AnimeErrorCode.VERSION_CONFLICT, httpStatus: 409, message: 'Version mismatch.' });
  if (RESTRICTED_APPROVAL_TYPES.has(existing.type) && existing.requested_by === input.actor_user_id) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, httpStatus: 403, message: 'Self-approval not allowed.' });
  const auditEventId = randomUUID(); const decidedAtIso = new Date().toISOString();
  const { data: updated, error: updateError } = await animeSupabase.from('approval_decisions').update({ status: input.decision, decision: input.decision, decision_reason: input.reason, decision_by: input.actor_user_id, decided_at: decidedAtIso, audit_event_id: auditEventId, updated_at: decidedAtIso }).eq('project_id', input.project_id).eq('id', input.approval_id).eq('resource_version', input.expected_resource_version).eq('status', ApprovalStatus.PENDING).select('*').maybeSingle<ApprovalRecord>();
  if (updateError !== null || updated === null) throw new AnimeError({ code: AnimeErrorCode.VERSION_CONFLICT, httpStatus: 409, message: 'Concurrent conflict.' });
  await writeAudit({ project_id: input.project_id, user_id: input.actor_user_id, workflow_name: 'APPROVAL_ENGINE', action: `APPROVAL_${input.decision}`, entity_type: existing.type, entity_id: existing.resource_id, new_value: { approval_id: updated.id, status: updated.status, decision: updated.decision }, reason: input.reason, request_id: input.request_id });

  // After APPROVED, automatically submit the existing anime command with intent=APPROVE_CANON_CHANGE
  // to trigger the outbox → WF-00 → WF-09 pipeline. Rejected approvals never submit a command.
  if (input.decision === ApprovalStatus.APPROVED) {
    // Build the command payload from the approval's exact_diff (proposed Canon changes)
    const exactDiff = existing.exact_diff as { proposed_events?: string[], new_facts_to_add?: any[], new_knowledge_to_add?: any[], characters_involved?: string[] } || {};
    const episodeNo = parseInt(existing.resource_id) || 1;

    const commandPayload = {
      intent: 'APPROVE_CANON_CHANGE',
      mode: 'SAVE',
      episode_no: episodeNo,
      episode_number: episodeNo,
      season_no: 1,
      proposed_events: exactDiff.proposed_events || [],
      new_facts_to_add: exactDiff.new_facts_to_add || [],
      new_knowledge_to_add: exactDiff.new_knowledge_to_add || [],
      characters_involved: exactDiff.characters_involved || [],
      project_id: input.project_id,
      user_id: input.actor_user_id,
      request_id: input.request_id,
      wf_key: 'WF-09',
    };

    const outboxPayload = {
      ...commandPayload,
      project_id: input.project_id,
      user_id: input.actor_user_id,
      intent: 'APPROVE_CANON_CHANGE',
      idempotency_key: input.request_id,
    };

    // Use the existing atomic command insert function, which handles both api_commands and outbox_events
    await insertCommandAtomic({
      command_id: randomUUID(),
      project_id: input.project_id,
      user_id: input.actor_user_id,
      intent: 'APPROVE_CANON_CHANGE',
      payload: commandPayload,
      status: 'QUEUED',
      body_hash: '',
      outbox_type: 'dispatch_n8n',
      outbox_payload: outboxPayload,
    });
  }

  return updated;
}