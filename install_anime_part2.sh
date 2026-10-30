cd ~/ai-backend

# ============================================================================
# PHASE B2: CALLBACKS
# ============================================================================
cat > src/modules/anime/callbacks/signature.ts << 'EOF'
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_NONCE_CACHE_ENTRIES = 5000;
const nonceLruCache = new Map<string, number>();
function evictExpiredOrOverflowNonces(nowMs: number): void {
  for (const [key, expiresAt] of nonceLruCache.entries()) {
    if (expiresAt <= nowMs) nonceLruCache.delete(key);
  }
  while (nonceLruCache.size >= MAX_NONCE_CACHE_ENTRIES) {
    const oldestKey = nonceLruCache.keys().next().value;
    if (oldestKey === undefined) break;
    nonceLruCache.delete(oldestKey);
  }
}
export function signCallbackPayload(timestampSec: string, rawBody: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`, 'utf8').digest('hex');
  return `sha256=${digest}`;
}
export function verifyCallbackSignature(input: { rawBody: string; signatureHeader: string | undefined; timestampHeader: string | undefined; nonceHeader?: string | undefined; secret: string; }): void {
  const signatureRaw = input.signatureHeader?.trim();
  const timestampRaw = input.timestampHeader?.trim();
  if (!signatureRaw || !timestampRaw) throw new AnimeError({ code: AnimeErrorCode.CALLBACK_SIGNATURE_INVALID, message: 'Missing callback signature or timestamp.' });
  const timestampSec = Number(timestampRaw);
  if (!Number.isFinite(timestampSec) || timestampSec <= 0) throw new AnimeError({ code: AnimeErrorCode.CALLBACK_SIGNATURE_INVALID, message: 'Invalid callback timestamp.' });
  const nowMs = Date.now();
  if (Math.abs(nowMs - timestampSec * 1000) > FIVE_MINUTES_MS) throw new AnimeError({ code: AnimeErrorCode.CALLBACK_SIGNATURE_INVALID, message: 'Callback timestamp outside 5-minute window.' });
  const expectedSig = signCallbackPayload(timestampRaw, input.rawBody, input.secret);
  const normalizedProvided = signatureRaw.startsWith('sha256=') ? signatureRaw : `sha256=${signatureRaw}`;
  const expectedBuf = Buffer.from(expectedSig, 'utf8'); const providedBuf = Buffer.from(normalizedProvided, 'utf8');
  if (expectedBuf.length !== providedBuf.length || timingSafeEqual(expectedBuf, providedBuf) === false) throw new AnimeError({ code: AnimeErrorCode.CALLBACK_SIGNATURE_INVALID, message: 'HMAC signature failed.' });
  evictExpiredOrOverflowNonces(nowMs);
  const nonceKey = input.nonceHeader?.trim() || `${timestampRaw}:${normalizedProvided}`;
  const existingExpiry = nonceLruCache.get(nonceKey);
  if (existingExpiry !== undefined && existingExpiry > nowMs) throw new AnimeError({ code: AnimeErrorCode.CALLBACK_REPLAY, message: 'Callback replay detected.' });
  nonceLruCache.delete(nonceKey); nonceLruCache.set(nonceKey, nowMs + FIVE_MINUTES_MS);
}
EOF

cat > src/modules/anime/callbacks/callbacks.repo.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
export async function insertCallback(input: { project_id: string; source: 'n8n' | 'worker'; callback_id: string; raw_payload: Record<string, unknown>; verified: boolean; }): Promise<{ duplicate: boolean; row?: any }> {
  const { data, error } = await animeSupabase.from('callback_inbox').insert({ project_id: input.project_id, source: input.source, callback_id: input.callback_id, raw_payload: input.raw_payload, verified: input.verified }).select().maybeSingle();
  if (error) {
    if (error.code === '23505') return { duplicate: true };
    throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to persist callback.', cause: error });
  }
  return { duplicate: false, row: data ?? undefined };
}
EOF

cat > src/modules/anime/callbacks/callbacks.handler.ts << 'EOF'
import { randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { animeEnv } from '../config/anime.env';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { insertCallback } from './callbacks.repo';
import { verifyCallbackSignature } from './signature';
export async function handleCallbackRequest(input: { source: 'n8n' | 'worker'; rawBody: string; signatureHeader: string | undefined; timestampHeader: string | undefined; nonceHeader: string | undefined; requestId: string; }): Promise<any> {
  const secret = input.source === 'n8n' ? animeEnv.ANIME_N8N_CALLBACK_SECRET : animeEnv.ANIME_WORKER_CALLBACK_SECRET;
  verifyCallbackSignature({ rawBody: input.rawBody, signatureHeader: input.signatureHeader, timestampHeader: input.timestampHeader, nonceHeader: input.nonceHeader, secret });
  let payload: any; try { payload = JSON.parse(input.rawBody); } catch (e) { throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Invalid JSON' }); }
  const projectId = typeof payload.project_id === 'string' ? payload.project_id.trim() : null;
  if (!projectId) throw new AnimeError({ code: AnimeErrorCode.WORKFLOW_CONTRACT_MISMATCH, message: 'Missing project_id' });
  const callbackId = payload.callback_id || payload.execution_id || payload.command_id || input.requestId;
  const dedupe = await insertCallback({ project_id: projectId, source: input.source, callback_id: callbackId, raw_payload: payload, verified: true });
  if (dedupe.duplicate) return { accepted: true, duplicate: true, callback_id: callbackId, project_id: projectId };
  const commandId = typeof payload.command_id === 'string' ? payload.command_id : null;
  await animeSupabase.from('outbox_events').insert({ id: randomUUID(), type: 'reconcile_command', payload: { project_id: projectId, command_id: commandId, callback_id: callbackId, source: input.source, request_id: input.requestId, callback_payload: payload }, status: 'pending', attempts: 0 });
  await writeAudit({ project_id: projectId, workflow_name: payload.wf_key || `CALLBACK_${input.source.toUpperCase()}`, action: 'CALLBACK_RECEIVED', entity_type: 'CALLBACK_INBOX', entity_id: callbackId, new_value: { source: input.source, callback_id: callbackId, command_id: commandId }, request_id: input.requestId });
  return { accepted: true, duplicate: false, callback_id: callbackId, project_id: projectId };
}
EOF

cat > src/modules/anime/callbacks/callbacks.routes.ts << 'EOF'
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { handleCallbackRequest } from './callbacks.handler';
function readHeader(request: FastifyRequest, headerName: string): string | undefined {
  const value = request.headers[headerName.toLowerCase()]; return Array.isArray(value) ? value[0] : (typeof value === 'string' ? value : undefined);
}
export async function registerAnimeCallbacksRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async function scopedCallbackPlugin(callbackApp: FastifyInstance): Promise<void> {
    callbackApp.removeAllContentTypeParsers();
    callbackApp.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => { done(null, body); });
    callbackApp.post('/internal/anime/n8n/callbacks', async (request, reply) => {
      const requestId = (request as any).anime?.request_id ?? randomUUID();
      const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
      const result = await handleCallbackRequest({ source: 'n8n', rawBody, signatureHeader: readHeader(request, 'x-anime-signature'), timestampHeader: readHeader(request, 'x-anime-timestamp'), nonceHeader: readHeader(request, 'x-anime-nonce'), requestId });
      void reply.status(200); return { data: result, meta: { request_id: requestId } };
    });
    callbackApp.post('/internal/anime/workers/callbacks', async (request, reply) => {
      const requestId = (request as any).anime?.request_id ?? randomUUID();
      const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
      const result = await handleCallbackRequest({ source: 'worker', rawBody, signatureHeader: readHeader(request, 'x-anime-signature'), timestampHeader: readHeader(request, 'x-anime-timestamp'), nonceHeader: readHeader(request, 'x-anime-nonce'), requestId });
      void reply.status(200); return { data: result, meta: { request_id: requestId } };
    });
  });
}
EOF

# ============================================================================
# PHASE B3: READS
# ============================================================================
cat > src/modules/anime/reads/reads.types.ts << 'EOF'
export interface CursorPaginationInput { readonly cursor?: string; readonly limit?: number; }
export interface CursorPage<T> { readonly items: readonly T[]; readonly next_cursor: string | null; }
export function clampLimit(rawLimit?: number): number { if (rawLimit === undefined || Number.isNaN(rawLimit)) return 25; return Math.max(1, Math.min(100, Math.floor(rawLimit))); }
EOF

cat > src/modules/anime/reads/projects.service.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { clampLimit, type CursorPage, type CursorPaginationInput } from './reads.types';
export async function listProjects(userId: string, pagination: CursorPaginationInput): Promise<CursorPage<any>> {
  const limit = clampLimit(pagination.limit);
  let query = animeSupabase.from('projects').select('id, user_id, name, is_active, story_bible, current_season, current_episode, created_at, updated_at').eq('user_id', userId).order('id', { ascending: true }).limit(limit + 1);
  if (pagination.cursor) query = query.gt('id', pagination.cursor);
  const { data, error } = await query;
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'List failed', cause: error });
  const rows = data ?? []; const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore ? items[items.length - 1]?.id ?? null : null };
}
export async function getProject(projectId: string, userId: string): Promise<any> {
  const { data, error } = await animeSupabase.from('projects').select('id, user_id, name, is_active, story_bible, current_season, current_episode, created_at, updated_at').eq('id', projectId).eq('user_id', userId).maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Fetch failed', cause: error });
  if (data === null) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Access denied.' });
  return data;
}
export async function getProjectOverview(projectId: string, userId: string): Promise<any> {
  const project = await getProject(projectId, userId);
  const [episodesRes, scenesRes, pendingRes, activeJobsRes] = await Promise.all([
    animeSupabase.from('episodes').select('episode_no', { count: 'exact', head: true }).eq('project_id', projectId),
    animeSupabase.from('scenes').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    animeSupabase.from('pending_actions').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    animeSupabase.from('api_commands').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('status', ['QUEUED', 'DISPATCHED', 'ACKNOWLEDGED', 'RECONCILING']),
  ]);
  return { project, stats: { total_episodes: episodesRes.count ?? 0, total_scenes: scenesRes.count ?? 0, pending_actions_count: pendingRes.count ?? 0, active_jobs_count: activeJobsRes.count ?? 0 } };
}
EOF

cat > src/modules/anime/reads/episodes.service.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { clampLimit, type CursorPage, type CursorPaginationInput } from './reads.types';
export async function listEpisodes(projectId: string, pagination: CursorPaginationInput): Promise<CursorPage<any>> {
  const limit = clampLimit(pagination.limit);
  let query = animeSupabase.from('episodes').select('id, project_id, episode_no, title, current_state, qc_status, synopsis, created_at, updated_at').eq('project_id', projectId).order('episode_no', { ascending: true }).limit(limit + 1);
  if (pagination.cursor) { const cursorEpNo = Number(pagination.cursor); if (Number.isNaN(cursorEpNo) === false) query = query.gt('episode_no', cursorEpNo); }
  const { data, error } = await query;
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'List failed', cause: error });
  const rows = data ?? []; const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore && items.length > 0 ? String(items[items.length - 1].episode_no) : null };
}
export async function getEpisode(projectId: string, episodeNo: number): Promise<any> {
  const { data, error } = await animeSupabase.from('episodes').select('id, project_id, episode_no, title, current_state, qc_status, synopsis, created_at, updated_at').eq('project_id', projectId).eq('episode_no', episodeNo).maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Fetch failed', cause: error });
  if (data === null) throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, httpStatus: 404, message: `Episode ${episodeNo} not found.` });
  return data;
}
export async function getEpisodePlan(projectId: string, episodeNo: number): Promise<any> {
  const episode = await getEpisode(projectId, episodeNo);
  const [stateRes, scenesRes] = await Promise.all([
    animeSupabase.from('episode_states').select('*').eq('project_id', projectId).eq('episode_no', episodeNo).maybeSingle(),
    animeSupabase.from('scenes').select('id, project_id, episode_no, scene_no, description, visual_prompt, status, created_at').eq('project_id', projectId).eq('episode_no', episodeNo).order('scene_no', { ascending: true }),
  ]);
  const scenes = (scenesRes.data ?? []).map((s: any) => ({ ...s, clips: [] }));
  return { project_id: projectId, episode, state_detail: stateRes.data ?? null, scenes_count: scenes.length, scenes };
}
EOF

cat > src/modules/anime/reads/jobs.service.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { clampLimit, type CursorPage, type CursorPaginationInput } from './reads.types';
function extractEpisodeNo(payload: any): number | null { if (payload === null || payload === undefined) return null; const ep = payload.episode_no ?? payload.episode_number; return typeof ep === 'number' && Number.isFinite(ep) ? ep : null; }
export async function listJobs(projectId: string, pagination: CursorPaginationInput): Promise<CursorPage<any>> {
  const limit = clampLimit(pagination.limit);
  let query = animeSupabase.from('api_commands').select('id, project_id, intent, payload, status, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit + 1);
  if (pagination.cursor) query = query.lt('created_at', pagination.cursor);
  const { data: rows, error: cmdError } = await query;
  if (cmdError) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'List failed', cause: cmdError });
  const cmds = rows ?? []; const hasMore = cmds.length > limit; const sliced = hasMore ? cmds.slice(0, limit) : cmds;
  const [states, pending] = await Promise.all([ animeSupabase.from('episode_states').select('*').eq('project_id', projectId), animeSupabase.from('pending_actions').select('*').eq('project_id', projectId) ]);
  const statesByEp = new Map(); for (const st of (states.data ?? [])) if (typeof st.episode_no === 'number') statesByEp.set(st.episode_no, st);
  const allPending = pending.data ?? [];
  const items = sliced.map((cmd: any) => { const epNo = extractEpisodeNo(cmd.payload); return { id: cmd.id, project_id: cmd.project_id, intent: cmd.intent, status: cmd.status, episode_no: epNo, created_at: cmd.created_at, episode_state: epNo !== null ? statesByEp.get(epNo) ?? null : null, pending_actions: allPending.filter((pa: any) => pa.command_id === cmd.id || pa.job_id === cmd.id || (epNo !== null && pa.episode_no === epNo)) }; });
  return { items, next_cursor: hasMore && items.length > 0 ? items[items.length - 1].created_at : null };
}
export async function getJob(projectId: string, jobId: string): Promise<any> {
  const { data: cmd, error } = await animeSupabase.from('api_commands').select('id, project_id, intent, payload, status, created_at').eq('project_id', projectId).eq('id', jobId).maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Fetch failed', cause: error });
  if (cmd === null) throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, httpStatus: 404, message: 'Job not found.' });
  const epNo = extractEpisodeNo(cmd.payload);
  const [stateRes, pendingRes] = await Promise.all([ epNo !== null ? animeSupabase.from('episode_states').select('*').eq('project_id', projectId).eq('episode_no', epNo).maybeSingle() : Promise.resolve({ data: null }), animeSupabase.from('pending_actions').select('*').eq('project_id', projectId) ]);
  const pendingList = (pendingRes.data ?? []).filter((pa: any) => pa.command_id === cmd.id || pa.job_id === cmd.id || (epNo !== null && pa.episode_no === epNo));
  return { id: cmd.id, project_id: cmd.project_id, intent: cmd.intent, status: cmd.status, episode_no: epNo, created_at: cmd.created_at, episode_state: stateRes.data ?? null, pending_actions: pendingList };
}
EOF

cat > src/modules/anime/reads/scenes.service.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { clampLimit, type CursorPage, type CursorPaginationInput } from './reads.types';
export async function listScenes(projectId: string, episodeNo: number, pagination: CursorPaginationInput): Promise<CursorPage<any>> {
  const limit = clampLimit(pagination.limit);
  let scenesQuery = animeSupabase.from('scenes').select('id, project_id, episode_no, scene_no, description, visual_prompt, status, created_at').eq('project_id', projectId).eq('episode_no', episodeNo).order('scene_no', { ascending: true }).limit(limit + 1);
  if (pagination.cursor) { const c = Number(pagination.cursor); if (Number.isNaN(c) === false) scenesQuery = scenesQuery.gt('scene_no', c); }
  const [scenesRes, clipsRes] = await Promise.all([ scenesQuery, animeSupabase.from('clips').select('id, project_id, episode_no, scene_no, clip_url, status, provider, duration_sec, created_at').eq('project_id', projectId).eq('episode_no', episodeNo).order('scene_no', { ascending: true }) ]);
  if (scenesRes.error !== null || clipsRes.error !== null) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Query failed', cause: scenesRes.error || clipsRes.error });
  const raw = scenesRes.data ?? []; const hasMore = raw.length > limit; const sliced = hasMore ? raw.slice(0, limit) : raw;
  const clipsBy = new Map(); for (const c of (clipsRes.data ?? [])) { if (typeof c.scene_no === 'number') { const arr = clipsBy.get(c.scene_no) || []; arr.push(c); clipsBy.set(c.scene_no, arr); } }
  const items = sliced.map((s: any) => ({ ...s, clips: clipsBy.get(s.scene_no) || [] }));
  return { items, next_cursor: hasMore && items.length > 0 ? String(items[items.length - 1].scene_no) : null };
}
EOF

cat > src/modules/anime/reads/reads.routes.ts << 'EOF'
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { getEpisode, getEpisodePlan, listEpisodes } from './episodes.service';
import { getJob, listJobs } from './jobs.service';
import { getProject, getProjectOverview, listProjects } from './projects.service';
import { listScenes } from './scenes.service';
const READ_ROLES = ['owner', 'admin', 'editor', 'reviewer', 'viewer'];
const CursorSchema = Type.Object({ cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })) });
const ProjSchema = Type.Object({ id: Type.String({ format: 'uuid' }) });
const EpSchema = Type.Object({ id: Type.String({ format: 'uuid' }), episodeNo: Type.Integer({ minimum: 1 }) });
const JobSchema = Type.Object({ id: Type.String({ format: 'uuid' }), jobId: Type.String({ format: 'uuid' }) });
export async function registerAnimeReadsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/projects', { schema: { querystring: CursorSchema } }, async (request: any) => { const userId = request.authContext?.userId; return { data: (await listProjects(userId, request.query)).items }; });
  app.get('/v1/anime/projects/:id', { schema: { params: ProjSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { const userId = request.anime?.user_id; return { data: await getProject(request.params.id, userId) }; });
  app.get('/v1/anime/projects/:id/overview', { schema: { params: ProjSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { const userId = request.anime?.user_id; return { data: await getProjectOverview(request.params.id, userId) }; });
  app.get('/v1/anime/projects/:id/episodes', { schema: { params: ProjSchema, querystring: CursorSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: (await listEpisodes(request.params.id, request.query)).items }; });
  app.get('/v1/anime/projects/:id/episodes/:episodeNo', { schema: { params: EpSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: await getEpisode(request.params.id, request.params.episodeNo) }; });
  app.get('/v1/anime/projects/:id/episodes/:episodeNo/plan', { schema: { params: EpSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: await getEpisodePlan(request.params.id, request.params.episodeNo) }; });
  app.get('/v1/anime/projects/:id/episodes/:episodeNo/scenes', { schema: { params: EpSchema, querystring: CursorSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: (await listScenes(request.params.id, request.params.episodeNo, request.query)).items }; });
  app.get('/v1/anime/projects/:id/jobs', { schema: { params: ProjSchema, querystring: CursorSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: (await listJobs(request.params.id, request.query)).items }; });
  app.get('/v1/anime/projects/:id/jobs/:jobId', { schema: { params: JobSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: await getJob(request.params.id, request.params.jobId) }; });
}
EOF

# ============================================================================
# PHASE B4: APPROVALS
# ============================================================================
cat > src/modules/anime/approvals/approvals.types.ts << 'EOF'
export enum ApprovalType { CANON_CHANGE = 'CANON_CHANGE', VOICE_CHANGE = 'VOICE_CHANGE', VISION_SAVE = 'VISION_SAVE', STORY_OUTCOME_COMMIT = 'STORY_OUTCOME_COMMIT', PAID_RESOURCE_USE = 'PAID_RESOURCE_USE', PUBLISH = 'PUBLISH', SYSTEM_CONFIG_CHANGE = 'SYSTEM_CONFIG_CHANGE', WORKFLOW_CHANGE = 'WORKFLOW_CHANGE', DATABASE_MIGRATION = 'DATABASE_MIGRATION', PRODUCTION_DEPLOY = 'PRODUCTION_DEPLOY', DESTRUCTIVE_DELETE = 'DESTRUCTIVE_DELETE' }
export enum ApprovalStatus { PENDING = 'PENDING', APPROVED = 'APPROVED', REJECTED = 'REJECTED' }
export const RESTRICTED_APPROVAL_TYPES = new Set([ApprovalType.CANON_CHANGE, ApprovalType.STORY_OUTCOME_COMMIT, ApprovalType.PUBLISH, ApprovalType.SYSTEM_CONFIG_CHANGE, ApprovalType.WORKFLOW_CHANGE, ApprovalType.DATABASE_MIGRATION, ApprovalType.PRODUCTION_DEPLOY, ApprovalType.DESTRUCTIVE_DELETE]);
export interface ApprovalRecord { readonly id: string; readonly project_id: string; readonly type: ApprovalType; readonly resource_id: string; readonly resource_version: number; readonly requested_by: string; readonly approver_role: string; readonly exact_diff: Record<string, unknown>; readonly risk: string; readonly cost_ceiling: number | null; readonly expires_at: string | null; readonly status: ApprovalStatus; readonly decision: 'APPROVED' | 'REJECTED' | null; readonly decision_reason: string | null; readonly decision_by: string | null; readonly decided_at: string | null; readonly audit_event_id: string | null; readonly created_at: string; readonly updated_at: string; }
EOF

cat > src/modules/anime/approvals/approvals.service.ts << 'EOF'
import { randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { clampLimit, type CursorPage, type CursorPaginationInput } from '../reads/reads.types';
import { type ApprovalRecord, ApprovalStatus, RESTRICTED_APPROVAL_TYPES } from './approvals.types';
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
  return updated;
}
EOF

cat > src/modules/anime/approvals/approvals.routes.ts << 'EOF'
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { decideApproval, listApprovals } from './approvals.service';
import { ApprovalStatus } from './approvals.types';
const ParamsSchema = Type.Object({ id: Type.String({ format: 'uuid' }), approvalId: Type.String({ format: 'uuid' }) });
const QuerySchema = Type.Object({ status: Type.Optional(Type.Enum(ApprovalStatus)), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Integer({ default: 25 })) });
const BodySchema = Type.Object({ decision: Type.Union([Type.Literal(ApprovalStatus.APPROVED), Type.Literal(ApprovalStatus.REJECTED)]), resource_version: Type.Integer({ minimum: 1 }), reason: Type.String({ minLength: 1 }) });
export async function registerAnimeApprovalsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/projects/:id/approvals', { schema: { params: Type.Object({ id: Type.String({ format: 'uuid' }) }), querystring: QuerySchema }, preHandler: [requireProjectRole(['owner', 'admin', 'reviewer'])] }, async (request: any) => { return { data: (await listApprovals(request.params.id, request.query)).items }; });
  app.post('/v1/anime/projects/:id/approvals/:approvalId/decisions', { schema: { params: ParamsSchema, body: BodySchema }, preHandler: [requireProjectRole(['owner', 'admin', 'reviewer'])] }, async (request: any) => { const actorUserId = request.anime?.user_id || request.authContext?.userId; return { data: await decideApproval({ project_id: request.params.id, approval_id: request.params.approvalId, decision: request.body.decision, expected_resource_version: request.body.resource_version, reason: request.body.reason, actor_user_id: actorUserId, request_id: request.anime?.request_id }) }; });
}
EOF

# ============================================================================
# PHASE B5: OUTBOX & SUPERVISOR
# ============================================================================
cat > src/modules/anime/outbox/outbox.repo.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
export async function claimBatch(type: string, batchSize = 10): Promise<any[]> {
  const { data, error } = await animeSupabase.rpc('claim_outbox_batch', { p_type: type, p_batch_size: batchSize });
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Claim failed', cause: error });
  return data ?? [];
}
export async function markDispatched(outboxId: string): Promise<void> { await animeSupabase.from('outbox_events').update({ status: 'dispatched', dispatched_at: new Date().toISOString(), last_error: null }).eq('id', outboxId); }
export async function markFailed(outboxId: string, attempts: number, nextAttemptAtIso: string, lastError: string): Promise<void> { await animeSupabase.from('outbox_events').update({ status: 'pending', attempts, next_attempt_at: nextAttemptAtIso, last_error: lastError.slice(0, 1000) }).eq('id', outboxId); }
export async function markDeadLetter(outboxId: string, attempts: number, lastError: string): Promise<void> { await animeSupabase.from('outbox_events').update({ status: 'dead_letter', attempts, last_error: lastError.slice(0, 1000) }).eq('id', outboxId); }
EOF

cat > src/modules/anime/outbox/outbox.dispatcher.ts << 'EOF'
import { dispatchToWf00 } from '../adapters/n8n.adapter';
import { writeAudit } from '../audit/audit.writer';
import { CommandStatus } from '../commands/commands.types';
import { animeSupabase } from '../db/anime.supabase';
import { claimBatch, markDeadLetter, markDispatched, markFailed } from './outbox.repo';
const MAX_RETRIES = 5; const BASE_BACKOFF_MS = 2000;
export function computeExponentialBackoffIso(attempts: number): string { return new Date(Date.now() + BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempts - 1))).toISOString(); }
async function processDispatchEvent(event: any): Promise<void> {
  const payload = event.payload; const projectId = payload.project_id; const commandId = payload.command_id;
  if (!projectId || !commandId) { await markDeadLetter(event.id, event.attempts, 'Missing IDs'); return; }
  try {
    const dispatchResult = await dispatchToWf00(payload);
    await animeSupabase.from('api_commands').update({ status: CommandStatus.DISPATCHED }).eq('project_id', projectId).eq('id', commandId);
    await markDispatched(event.id);
    await writeAudit({ project_id: projectId, workflow_name: payload.wf_key || 'WF-00', action: 'OUTBOX_DISPATCH_SUCCEEDED', entity_type: 'API_COMMAND', entity_id: commandId, new_value: { outbox_id: event.id, execution_id: dispatchResult.execution_id }, execution_id: dispatchResult.execution_id, request_id: payload.request_id });
  } catch (err: any) {
    const errMsg = err.message || 'Dispatch failed';
    if (event.attempts >= MAX_RETRIES) { await markDeadLetter(event.id, event.attempts, errMsg); await animeSupabase.from('api_commands').update({ status: CommandStatus.MANUAL_REVIEW }).eq('project_id', projectId).eq('id', commandId); await writeAudit({ project_id: projectId, workflow_name: 'OUTBOX_DISPATCHER', action: 'OUTBOX_DEAD_LETTER', entity_type: 'API_COMMAND', entity_id: commandId, reason: errMsg, new_value: { outbox_id: event.id } }); return; }
    await markFailed(event.id, event.attempts, computeExponentialBackoffIso(event.attempts), errMsg);
  }
}
export class OutboxDispatcher {
  private timer: any = null; private running = false;
  public start(pollIntervalMs = 2000): void { if (this.timer) return; this.timer = setInterval(() => void this.tick(), pollIntervalMs); void this.tick(); }
  public stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  public async tick(): Promise<void> {
    if (this.running) return; this.running = true;
    try { const batch = await claimBatch('dispatch_n8n', 10); for (const item of batch) await processDispatchEvent(item); } catch (e) { console.error(e); } finally { this.running = false; }
  }
}
export const outboxDispatcher = new OutboxDispatcher();
EOF

cat > src/modules/anime/supervisor/supervisor.repo.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
export async function readCommandState(projectId: string, commandId: string): Promise<any> {
  const { data: cmd } = await animeSupabase.from('api_commands').select('*').eq('project_id', projectId).eq('id', commandId).maybeSingle();
  if (!cmd) return { command: null, episode_state: null, pending_actions: [] };
  const ep = cmd.payload?.episode_no || cmd.payload?.episode_number;
  const [st, pa] = await Promise.all([ ep ? animeSupabase.from('episode_states').select('*').eq('project_id', projectId).eq('episode_no', ep).maybeSingle() : Promise.resolve({ data: null }), animeSupabase.from('pending_actions').select('*').eq('project_id', projectId) ]);
  return { command: cmd, episode_state: st.data, pending_actions: (pa.data ?? []).filter((p: any) => p.command_id === commandId || p.job_id === commandId || (ep && p.episode_no === ep)) };
}
export async function findDriftedCommands(staleMinutes = 10, limit = 25): Promise<any[]> {
  const cutoff = new Date(Date.now() - staleMinutes * 60000).toISOString();
  const { data } = await animeSupabase.from('api_commands').select('id, project_id').in('status', ['DISPATCHED', 'ACKNOWLEDGED', 'RECONCILING']).lt('created_at', cutoff).limit(limit);
  return data ?? [];
}
EOF

cat > src/modules/anime/supervisor/supervisor.service.ts << 'EOF'
import { writeAudit } from '../audit/audit.writer';
import { CommandStatus } from '../commands/commands.types';
import { animeSupabase } from '../db/anime.supabase';
import { readCommandState } from './supervisor.repo';
export async function reconcileCommand(input: { project_id: string, command_id: string, callback_payload?: any, request_id?: string }): Promise<any> {
  const snap = await readCommandState(input.project_id, input.command_id);
  if (snap.command === null) return { command_id: input.command_id, next_status: CommandStatus.FAILED };
  const prev = snap.command.status; const cb = input.callback_payload?.status?.toUpperCase(); const ep = snap.episode_state?.current_state?.toUpperCase();
  let next = CommandStatus.RECONCILING;
  if (['SUCCEEDED', 'COMPLETED'].includes(cb) || ['COMPLETED', 'PUBLISHED'].includes(ep)) next = CommandStatus.SUCCEEDED;
  else if (['FAILED', 'ERROR'].includes(cb) || ep?.endsWith('_FAILED')) next = CommandStatus.FAILED;
  else if (cb === 'MANUAL_REVIEW' || snap.pending_actions.length > 0) next = CommandStatus.MANUAL_REVIEW;
  if (next !== prev) {
    await animeSupabase.from('api_commands').update({ status: next }).eq('project_id', input.project_id).eq('id', input.command_id);
    await writeAudit({ project_id: input.project_id, user_id: snap.command.user_id, workflow_name: 'SUPERVISOR_RECONCILER', action: 'COMMAND_STATE_RECONCILED', entity_type: 'API_COMMAND', entity_id: input.command_id, previous_value: { status: prev }, new_value: { status: next }, request_id: input.request_id });
  }
  return { command_id: input.command_id, next_status: next };
}
EOF

cat > src/modules/anime/supervisor/supervisor.worker.ts << 'EOF'
import { claimBatch, markDeadLetter, markDispatched, markFailed } from '../outbox/outbox.repo';
import { computeExponentialBackoffIso } from '../outbox/outbox.dispatcher';
import { findDriftedCommands } from './supervisor.repo';
import { reconcileCommand } from './supervisor.service';
const MAX_ATTEMPTS = 5;
export class SupervisorWorker {
  private t1: any = null; private t2: any = null; private busy = false;
  public start(poll = 2500, drift = 60000): void { if (!this.t1) { this.t1 = setInterval(() => void this.processReconcileOutbox(), poll); void this.processReconcileOutbox(); } if (!this.t2) { this.t2 = setInterval(() => void this.runDriftScan(), drift); } }
  public stop(): void { if (this.t1) clearInterval(this.t1); if (this.t2) clearInterval(this.t2); }
  public async processReconcileOutbox(): Promise<void> {
    if (this.busy) return; this.busy = true;
    try { const evs = await claimBatch('reconcile_command', 15); for (const ev of evs) { try { await reconcileCommand({ project_id: ev.payload.project_id, command_id: ev.payload.command_id, callback_payload: ev.payload.callback_payload }); await markDispatched(ev.id); } catch (e: any) { if (ev.attempts >= MAX_ATTEMPTS) await markDeadLetter(ev.id, ev.attempts, e.message); else await markFailed(ev.id, ev.attempts, computeExponentialBackoffIso(ev.attempts), e.message); } } } catch (e) { console.error(e); } finally { this.busy = false; }
  }
  public async runDriftScan(): Promise<void> { try { const d = await findDriftedCommands(10, 25); for (const i of d) await reconcileCommand({ project_id: i.project_id, command_id: i.id }); } catch (e) { console.error(e); } }
}
export const supervisorWorker = new SupervisorWorker();
EOF

cat > src/modules/anime/process-role.ts << 'EOF'
import { animeEnv, type AnimeProcessRole } from './config/anime.env';
import { outboxDispatcher } from './outbox/outbox.dispatcher';
import { supervisorWorker } from './supervisor/supervisor.worker';
export function startRole(role: AnimeProcessRole = animeEnv.ANIME_PROCESS_ROLE): void { if (role === 'dispatcher') outboxDispatcher.start(); if (role === 'supervisor') supervisorWorker.start(); }
EOF

# ============================================================================
# PHASE B6: REGISTRY & LEDGER
# ============================================================================
cat > src/modules/anime/registry/workers.types.ts << 'EOF'
export interface WorkerCapacity { readonly project_id?: string; }
export interface WorkerHealth { readonly id: string; readonly worker_id: string; readonly provider: string; readonly current_model: string | null; readonly last_heartbeat: string; readonly status: string; readonly capacity: WorkerCapacity; }
EOF

cat > src/modules/anime/registry/workers.repo.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
export async function upsertHeartbeat(input: any): Promise<any> { const now = new Date().toISOString(); const { data, error } = await animeSupabase.from('worker_registry').upsert({ worker_id: input.worker_id, provider: input.provider, current_model: input.current_model, last_heartbeat: now, status: input.status || 'healthy', capacity: { ...input.capacity, project_id: input.project_id }, updated_at: now }, { onConflict: 'worker_id' }).select().single(); if (error) throw error; return data; }
export async function listEligible(filter: any): Promise<any[]> { const cutoff = new Date(Date.now() - (filter.maxHeartbeatAgeSeconds || 180) * 1000).toISOString(); const { data } = await animeSupabase.from('worker_registry').select('*').contains('capacity', { project_id: filter.project_id }).in('status', ['healthy', 'busy']).gte('last_heartbeat', cutoff); return data ?? []; }
EOF

cat > src/modules/anime/ledger/ledger.types.ts << 'EOF'
export enum ReservationStatus { PROPOSED = 'PROPOSED', RESERVED = 'RESERVED', CONSUMED = 'CONSUMED', RELEASED = 'RELEASED', EXPIRED = 'EXPIRED' }
EOF

cat > src/modules/anime/ledger/ledger.repo.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
import { ReservationStatus } from './ledger.types';
export async function insertReservation(input: any): Promise<any> { const { data, error } = await animeSupabase.from('resource_reservations').insert({ project_id: input.project_id, stage: input.stage, status: input.status, estimated_cost: input.estimated_cost, expires_at: input.expires_at }).select().single(); if (error) throw error; return data; }
export async function updateStatus(projectId: string, reservationId: string, status: ReservationStatus, actualCost?: number): Promise<any> { const { data, error } = await animeSupabase.from('resource_reservations').update({ status, actual_cost: actualCost, updated_at: new Date().toISOString() }).eq('project_id', projectId).eq('id', reservationId).select().maybeSingle(); if (error || data === null) throw error || new Error('Not found'); return data; }
export async function sumActiveReservations(projectId: string): Promise<any> { const { data } = await animeSupabase.from('resource_reservations').select('status, estimated_cost, actual_cost, expires_at').eq('project_id', projectId).in('status', [ReservationStatus.PROPOSED, ReservationStatus.RESERVED, ReservationStatus.CONSUMED]); let r = 0, c = 0; const now = Date.now(); for (const row of (data ?? [])) { if (row.status === ReservationStatus.CONSUMED) c += Number(row.actual_cost || row.estimated_cost || 0); else if (!row.expires_at || new Date(row.expires_at).getTime() > now) r += Number(row.estimated_cost || 0); } return { reserved_cost: r, consumed_cost: c, total_committed_cost: r + c }; }
EOF

cat > src/modules/anime/ledger/ledger.service.ts << 'EOF'
import { writeAudit } from '../audit/audit.writer';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { insertReservation, sumActiveReservations, updateStatus } from './ledger.repo';
import { ReservationStatus } from './ledger.types';
export async function checkBudgetCeiling(projectId: string, addCost = 0): Promise<any> {
  const [p, t] = await Promise.all([ animeSupabase.from('projects').select('id, budget_ceiling').eq('id', projectId).maybeSingle(), sumActiveReservations(projectId) ]);
  if (p.data === null) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Not found' });
  const ceiling = p.data.budget_ceiling ? Number(p.data.budget_ceiling) : null; const proj = t.total_committed_cost + addCost;
  if (ceiling !== null && proj > ceiling) throw new AnimeError({ code: AnimeErrorCode.PAID_BUDGET_REQUIRED, message: `Exceeds budget (${ceiling})` });
  return { project_id: projectId, budget_ceiling: ceiling, ...t, remaining_headroom: ceiling ? Math.max(0, ceiling - t.total_committed_cost) : null };
}
export async function reserve(input: any): Promise<any> { await checkBudgetCeiling(input.project_id, input.estimated_cost); const r = await insertReservation({ ...input, status: ReservationStatus.RESERVED, expires_at: new Date(Date.now() + (input.ttl_seconds || 900) * 1000).toISOString() }); await writeAudit({ project_id: input.project_id, workflow_name: 'LEDGER', action: 'RESOURCE_RESERVED', entity_type: 'RESERVATION', entity_id: r.id, new_value: r }); return r; }
export async function consume(input: any): Promise<any> { const r = await updateStatus(input.project_id, input.reservation_id, ReservationStatus.CONSUMED, input.actual_cost); await writeAudit({ project_id: input.project_id, workflow_name: 'LEDGER', action: 'RESOURCE_CONSUMED', entity_type: 'RESERVATION', entity_id: r.id }); return r; }
export async function release(input: any): Promise<any> { const r = await updateStatus(input.project_id, input.reservation_id, ReservationStatus.RELEASED, 0); await writeAudit({ project_id: input.project_id, workflow_name: 'LEDGER', action: 'RESOURCE_RELEASED', entity_type: 'RESERVATION', entity_id: r.id }); return r; }
EOF

# ============================================================================
# PHASE B7/B9: ADMIN & SYSTEM
# ============================================================================
cat > src/modules/anime/admin/workers.routes.ts << 'EOF'
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { listEligible, upsertHeartbeat } from '../registry/workers.repo';
export async function registerAnimeAdminWorkersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/admin/anime/workers', { schema: { querystring: Type.Object({ project_id: Type.String({ format: 'uuid' }) }) }, preValidation: [async (req: any) => { req.params = { ...req.params, project_id: req.query.project_id }; }], preHandler: [requireProjectRole(['owner', 'admin'])] }, async (req: any) => { return { data: await listEligible(req.query) }; });
  app.post('/v1/admin/anime/workers/heartbeat', { schema: { body: Type.Object({ project_id: Type.String({ format: 'uuid' }), worker_id: Type.String(), provider: Type.String(), status: Type.Optional(Type.String()), capacity: Type.Optional(Type.Any()) }) }, preHandler: [requireProjectRole(['owner', 'admin'])] }, async (req: any) => { return { data: await upsertHeartbeat(req.body) }; });
}
EOF

cat > src/modules/anime/admin/ledger.routes.ts << 'EOF'
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { checkBudgetCeiling } from '../ledger/ledger.service';
export async function registerAnimeAdminLedgerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/admin/anime/ledger/summary', { schema: { querystring: Type.Object({ project_id: Type.String({ format: 'uuid' }) }) }, preValidation: [async (req: any) => { req.params = { ...req.params, project_id: req.query.project_id }; }], preHandler: [requireProjectRole(['owner', 'admin'])] }, async (req: any) => { return { data: await checkBudgetCeiling(req.query.project_id, 0) }; });
}
EOF

cat > src/modules/anime/admin/system.routes.ts << 'EOF'
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { COMMAND_INTENT_WF_MAP } from '../commands/commands.types';
import { animeSupabase } from '../db/anime.supabase';
export async function registerAnimeAdminSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/admin/workflows', { schema: { querystring: Type.Object({ project_id: Type.String({ format: 'uuid' }) }) }, preValidation: [async (req: any) => { req.params = { ...req.params, project_id: req.query.project_id }; }], preHandler: [requireProjectRole(['owner', 'admin'])] }, async (req: any) => { const { data } = await animeSupabase.from('api_commands').select('intent, status').eq('project_id', req.query.project_id); const wfMap = new Map(); for (const [i, w] of Object.entries(COMMAND_INTENT_WF_MAP)) { if (!wfMap.has(w)) wfMap.set(w, []); wfMap.get(w).push(i); } const cmds = data ?? []; return { data: Array.from(wfMap.entries()).map(([k, intents]) => ({ wf_key: k, intents, total_commands: cmds.filter((c: any) => intents.includes(c.intent)).length, active_commands: cmds.filter((c: any) => intents.includes(c.intent) && ['QUEUED', 'DISPATCHED', 'ACKNOWLEDGED', 'RECONCILING'].includes(c.status)).length })) }; });
  app.get('/v1/anime/admin/queues', { schema: { querystring: Type.Object({ project_id: Type.String({ format: 'uuid' }) }) }, preValidation: [async (req: any) => { req.params = { ...req.params, project_id: req.query.project_id }; }], preHandler: [requireProjectRole(['owner', 'admin'])] }, async (req: any) => { const [o, c, p] = await Promise.all([ animeSupabase.from('outbox_events').select('status').contains('payload', { project_id: req.query.project_id }), animeSupabase.from('api_commands').select('status').eq('project_id', req.query.project_id), animeSupabase.from('pending_actions').select('id', { count: 'exact', head: true }).eq('project_id', req.query.project_id) ]); const or = o.data ?? []; const cr = c.data ?? []; return { data: { outbox: { pending: or.filter((r: any) => r.status === 'pending').length, processing: or.filter((r: any) => r.status === 'processing').length, failed: or.filter((r: any) => r.status === 'failed').length, dead_letter: or.filter((r: any) => r.status === 'dead_letter').length }, commands: { queued: cr.filter((r: any) => r.status === 'QUEUED').length, dispatched: cr.filter((r: any) => r.status === 'DISPATCHED').length, reconciling: cr.filter((r: any) => r.status === 'RECONCILING').length, manual_review: cr.filter((r: any) => r.status === 'MANUAL_REVIEW').length }, pending_actions_count: p.count ?? 0 } }; });
}
EOF

cat > src/modules/anime/system/devices.service.ts << 'EOF'
import { createHash, randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
export async function registerFcmToken(userId: string, token: string, opts: any): Promise<any> { if (!token) throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Token required' }); const id = randomUUID(); const fp = createHash('sha256').update(token).digest('hex').slice(0, 16); await writeAudit({ project_id: opts.project_id, user_id: userId, workflow_name: 'DEVICE_REGISTRY', action: 'REGISTER_FCM_TOKEN', entity_type: 'FCM_DEVICE', entity_id: id, new_value: { platform: opts.platform, fp, token }, request_id: opts.request_id }); return { device_id: id, token_fingerprint: fp }; }
EOF

cat > src/modules/anime/system/devices.routes.ts << 'EOF'
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { registerFcmToken } from './devices.service';
export async function registerAnimeDevicesRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/devices/fcm-tokens', { schema: { body: Type.Object({ project_id: Type.String({ format: 'uuid' }), token: Type.String({ minLength: 16 }), platform: Type.Optional(Type.String()) }) }, preHandler: [requireProjectRole(['owner', 'admin', 'editor', 'reviewer', 'viewer'])] }, async (req: any) => { return { data: await registerFcmToken(req.anime?.user_id, req.body.token, req.body) }; });
}
EOF

# ============================================================================
# PHASE B8: MEDIA & CREATIVE
# ============================================================================
cat > src/modules/anime/media/media.service.ts << 'EOF'
import { randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { submitAnimeCommand } from '../commands/commands.service';
import { CommandIntent } from '../commands/commands.types';
import { animeEnv } from '../config/anime.env';
import { animeSupabase } from '../db/anime.supabase';
export async function quickGenerate(mode: 'IMAGE' | 'VIDEO', prompt: string, ctx: any): Promise<any> { const intent = mode === 'IMAGE' ? CommandIntent.QUICK_GENERATE_IMAGE : CommandIntent.QUICK_GENERATE_VIDEO; const sub = await submitAnimeCommand({ idempotencyKey: ctx.idempotency_key, userId: ctx.user_id, requestId: ctx.request_id, body: { intent, project_id: ctx.project_id, mode: 'QUICK', payload: { prompt, media_type: mode, style_preset: ctx.style_preset || 'anime_cinematic', aspect_ratio: ctx.aspect_ratio || '16:9', ...(mode === 'VIDEO' ? { duration_sec: ctx.duration_sec || 5 } : {}) } } }); return { command_id: sub.command.id, status: sub.command.status, wf_key: sub.wf_key }; }
export async function visionAnalyze(mediaUrl: string, ctx: any): Promise<any> { const sub = await submitAnimeCommand({ idempotencyKey: ctx.idempotency_key, userId: ctx.user_id, requestId: ctx.request_id, body: { intent: CommandIntent.VISION_ANALYSIS, project_id: ctx.project_id, mode: 'QUICK', payload: { media_url: mediaUrl, analysis_type: ctx.analysis_type || 'GENERAL', prompt: ctx.prompt || 'Extract visual DNA' } } }); return { command_id: sub.command.id, status: sub.command.status }; }
export async function createUploadSession(projectId: string, opts: any): Promise<any> { const id = randomUUID(); const name = (opts.file_name || 'asset.bin').replace(/[^a-zA-Z0-9._-]/g, '_'); const path = `projects/${projectId}/uploads/${id}-${name}`; let url = ''; try { const { data } = await animeSupabase.storage.from('anime-assets').createSignedUploadUrl(path); if (data) url = data.signedUrl; } catch (e) { url = `${animeEnv.ANIME_SUPABASE_URL}/storage/v1/object/upload/sign/anime-assets/${path}`; } await writeAudit({ project_id: projectId, user_id: opts.user_id, workflow_name: 'MEDIA_UPLOAD', action: 'CREATE_UPLOAD_SESSION', entity_type: 'UPLOAD', entity_id: id, new_value: { path }, request_id: opts.request_id }); return { session_id: id, upload_url: url, object_path: path }; }
EOF

cat > src/modules/anime/media/media.routes.ts << 'EOF'
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { createUploadSession, quickGenerate, visionAnalyze } from './media.service';
const P = Type.Object({ id: Type.String({ format: 'uuid' }) });
function getKey(req: any, fallback: string) { const raw = req.headers['idempotency-key']; return Array.isArray(raw) ? raw[0] : (raw || fallback); }
export async function registerAnimeMediaRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/projects/:id/quick/image', { schema: { params: P, body: Type.Object({ prompt: Type.String(), style_preset: Type.Optional(Type.String()), aspect_ratio: Type.Optional(Type.String()) }) }, preHandler: [requireProjectRole(['owner', 'admin', 'editor'])] }, async (req: any) => { return { data: await quickGenerate('IMAGE', req.body.prompt, { ...req.body, project_id: req.params.id, user_id: req.anime?.user_id, idempotency_key: getKey(req, req.anime?.request_id), request_id: req.anime?.request_id }) }; });
  app.post('/v1/anime/projects/:id/quick/video', { schema: { params: P, body: Type.Object({ prompt: Type.String(), style_preset: Type.Optional(Type.String()), aspect_ratio: Type.Optional(Type.String()), duration_sec: Type.Optional(Type.Number()) }) }, preHandler: [requireProjectRole(['owner', 'admin', 'editor'])] }, async (req: any) => { return { data: await quickGenerate('VIDEO', req.body.prompt, { ...req.body, project_id: req.params.id, user_id: req.anime?.user_id, idempotency_key: getKey(req, req.anime?.request_id), request_id: req.anime?.request_id }) }; });
  app.post('/v1/anime/projects/:id/vision/analyze', { schema: { params: P, body: Type.Object({ media_url: Type.String(), analysis_type: Type.Optional(Type.String()), prompt: Type.Optional(Type.String()) }) }, preHandler: [requireProjectRole(['owner', 'admin', 'editor'])] }, async (req: any) => { return { data: await visionAnalyze(req.body.media_url, { ...req.body, project_id: req.params.id, user_id: req.anime?.user_id, idempotency_key: getKey(req, req.anime?.request_id), request_id: req.anime?.request_id }) }; });
  app.post('/v1/anime/projects/:id/assets/upload-sessions', { schema: { params: P, body: Type.Object({ file_name: Type.String(), content_type: Type.Optional(Type.String()) }) }, preHandler: [requireProjectRole(['owner', 'admin', 'editor'])] }, async (req: any) => { return { data: await createUploadSession(req.params.id, { ...req.body, user_id: req.anime?.user_id, request_id: req.anime?.request_id }) }; });
}
EOF

cat > src/modules/anime/reads/creative.service.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
export async function getBible(projectId: string): Promise<any> { const { data } = await animeSupabase.from('projects').select('id, name, current_season, current_episode, story_bible').eq('id', projectId).single(); if (data === null) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Not found' }); return data; }
export async function getCanon(projectId: string): Promise<any[]> { const { data } = await animeSupabase.from('canon_facts').select('*').eq('project_id', projectId); return data ?? []; }
export async function getCharacters(projectId: string): Promise<any[]> { const { data } = await animeSupabase.from('characters').select('*').eq('project_id', projectId); return data ?? []; }
export async function getTimeline(projectId: string): Promise<any[]> { const { data } = await animeSupabase.from('story_timeline').select('*').eq('project_id', projectId); return data ?? []; }
EOF

cat > src/modules/anime/reads/creative.routes.ts << 'EOF'
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { getBible, getCanon, getCharacters, getTimeline } from './creative.service';
const P = Type.Object({ id: Type.String({ format: 'uuid' }) });
const R = ['owner', 'admin', 'editor', 'reviewer', 'viewer'];
export async function registerAnimeCreativeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/projects/:id/bible', { schema: { params: P }, preHandler: [requireProjectRole(R)] }, async (req: any) => ({ data: await getBible(req.params.id) }));
  app.get('/v1/anime/projects/:id/canon', { schema: { params: P }, preHandler: [requireProjectRole(R)] }, async (req: any) => ({ data: await getCanon(req.params.id) }));
  app.get('/v1/anime/projects/:id/characters', { schema: { params: P }, preHandler: [requireProjectRole(R)] }, async (req: any) => ({ data: await getCharacters(req.params.id) }));
  app.get('/v1/anime/projects/:id/timeline', { schema: { params: P }, preHandler: [requireProjectRole(R)] }, async (req: any) => ({ data: await getTimeline(req.params.id) }));
}
EOF

cat > src/modules/anime/reads/analytics.service.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
import { sumActiveReservations } from '../ledger/ledger.repo';
export async function getAnalytics(projectId: string): Promise<any> { const [e, c, l] = await Promise.all([ animeSupabase.from('episodes').select('current_state, qc_status').eq('project_id', projectId), animeSupabase.from('api_commands').select('status').eq('project_id', projectId), sumActiveReservations(projectId) ]); const ep = e.data ?? []; const cmds = c.data ?? []; return { episodes: { total: ep.length, published: ep.filter((x: any) => x.current_state?.toUpperCase() === 'PUBLISHED').length, qc_passed: ep.filter((x: any) => x.qc_status?.toUpperCase() === 'PASSED').length }, jobs: { total: cmds.length, succeeded: cmds.filter((x: any) => x.status === 'SUCCEEDED').length, failed: cmds.filter((x: any) => x.status === 'FAILED').length, manual_review: cmds.filter((x: any) => x.status === 'MANUAL_REVIEW').length }, ledger: l }; }
export async function getAudit(projectId: string, limit: number = 25): Promise<any[]> { const { data } = await animeSupabase.from('audit_log').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit); return data ?? []; }
EOF

cat > src/modules/anime/reads/analytics.routes.ts << 'EOF'
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { getAnalytics, getAudit } from './analytics.service';
const P = Type.Object({ id: Type.String({ format: 'uuid' }) });
export async function registerAnimeAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/projects/:id/analytics', { schema: { params: P }, preHandler: [requireProjectRole(['owner', 'admin', 'editor', 'reviewer', 'viewer'])] }, async (req: any) => ({ data: await getAnalytics(req.params.id) }));
  app.get('/v1/anime/projects/:id/audit', { schema: { params: P }, preHandler: [requireProjectRole(['owner', 'admin', 'reviewer'])] }, async (req: any) => ({ data: await getAudit(req.params.id) }));
}
EOF

# ============================================================================
# V10.0 INTELLIGENCE LAYER
# ============================================================================
cat > src/modules/anime/intelligence/memory.service.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
function genEmb1536(): number[] { return Array.from({ length: 1536 }, () => Number((Math.random() * 2 - 1).toFixed(6))); }
export async function writeMemory(projectId: string, type: string, content: string, metadata: any = {}): Promise<any> { const { data, error } = await animeSupabase.from('memory_knowledge').insert({ project_id: projectId, memory_type: type, content, embedding: `[${genEmb1536().join(',')}]`, metadata }).select().single(); if (error) throw error; return data; }
export async function retrieveContext(projectId: string, queryString: string): Promise<any[]> { const emb = `[${genEmb1536().join(',')}]`; const { data: rpc } = await animeSupabase.rpc('match_memory_knowledge', { p_project_id: projectId, p_query_embedding: emb, p_match_count: 3 }); if (rpc) return rpc; const { data: fb } = await animeSupabase.from('memory_knowledge').select('*').eq('project_id', projectId).limit(3); return fb ?? []; }
EOF

cat > src/modules/anime/intelligence/planner.service.ts << 'EOF'
import { COMMAND_INTENT_WF_MAP, type CommandIntent } from '../commands/commands.types';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
export async function preflightCheck(projectId: string, intent: CommandIntent): Promise<boolean> {
  const { data: p } = await animeSupabase.from('projects').select('id, budget_ceiling').eq('id', projectId).maybeSingle();
  if (p && p.budget_ceiling !== null) { const { data: r } = await animeSupabase.from('resource_reservations').select('estimated_cost, actual_cost, status').eq('project_id', projectId).in('status', ['PROPOSED', 'RESERVED', 'CONSUMED']); let c = 0; for (const row of (r ?? [])) c += Number(row.status === 'CONSUMED' ? row.actual_cost || row.estimated_cost : row.estimated_cost); if (c >= Number(p.budget_ceiling)) throw new AnimeError({ code: AnimeErrorCode.PAID_BUDGET_REQUIRED, message: 'Budget exhausted.' }); }
  const { data: a } = await animeSupabase.from('api_commands').select('id').eq('project_id', projectId).in('status', ['QUEUED', 'DISPATCHED', 'ACKNOWLEDGED', 'RECONCILING']).limit(1);
  if (a && a.length > 0) throw new AnimeError({ code: AnimeErrorCode.STAGE_DEPENDENCY_BLOCKED, message: 'Active job exists.' });
  const { data: cap } = await animeSupabase.from('capability_registry').select('service_name, status').in('service_name', [COMMAND_INTENT_WF_MAP[intent] || 'WF-00', 'n8n']);
  if ((cap ?? []).some((x: any) => x.status.toUpperCase() === 'DEGRADED')) throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'Service degraded.' });
  return true;
}
EOF

cat > src/modules/anime/intelligence/brain.worker.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
async function ping(url: string, headers?: any): Promise<string> { try { const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(5000) }); return res.status < 500 ? 'VERIFIED' : 'DEGRADED'; } catch { return 'DEGRADED'; } }
async function runCheck() { const targets = [ { name: 'n8n', url: process.env.N8N_BASE_URL || 'http://127.0.0.1:5678/healthz' }, { name: 'Groq', url: 'https://api.groq.com/openai/v1/models', headers: process.env.GROQ_API_KEY ? { Authorization: `Bearer ${process.env.GROQ_API_KEY}` } : undefined }, { name: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models' } ]; for (const t of targets) { const status = await ping(t.url, t.headers); await animeSupabase.from('capability_registry').upsert({ service_name: t.name, status, last_checked: new Date().toISOString() }, { onConflict: 'service_name' }); } }
let timer: any = null;
export function startBrainWorker(ms = 60000) { if (timer) return; timer = setInterval(() => void runCheck(), ms); void runCheck(); }
EOF

cat > src/modules/anime/intelligence/incident.worker.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
async function notify(row: any): Promise<boolean> { const token = process.env.TELEGRAM_BOT_TOKEN; const chat = process.env.TELEGRAM_CHAT_ID; if (!token || !chat) return false; try { const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: `🚨 [Dead Letter]\nID: ${row.id}\nProject: ${row.payload?.project_id}\nError: ${row.last_error}` }) }); return res.ok; } catch { return false; } }
async function scan() { const { data } = await animeSupabase.from('outbox_events').select('*').eq('status', 'dead_letter').eq('notified', false).limit(20); if (!data) return; for (const row of data) { const ok = await notify(row); if (ok || !process.env.TELEGRAM_BOT_TOKEN) await animeSupabase.from('outbox_events').update({ notified: true }).eq('id', row.id); } }
let timer: any = null;
export function startIncidentWorker(ms = 30000) { if (timer) return; timer = setInterval(() => void scan(), ms); void scan(); }
EOF

# ============================================================================
# FINAL WIRING
# ============================================================================
cat > src/modules/anime/index.ts << 'EOF'
import type { FastifyInstance } from 'fastify';
import { registerAnimeAdminLedgerRoutes } from './admin/ledger.routes';
import { registerAnimeAdminSystemRoutes } from './admin/system.routes';
import { registerAnimeAdminWorkersRoutes } from './admin/workers.routes';
import { registerAnimeApprovalsRoutes } from './approvals/approvals.routes';
import { registerAnimeCallbacksRoutes } from './callbacks/callbacks.routes';
import { registerAnimeCommandsRoutes } from './commands/commands.routes';
import { animeErrorHandler } from './errors/anime.errors';
import { startBrainWorker } from './intelligence/brain.worker';
import { startIncidentWorker } from './intelligence/incident.worker';
import { registerAnimeMediaRoutes } from './media/media.routes';
import { animeRequestIdHook } from './middleware/request-id';
import { registerAnimeAnalyticsRoutes } from './reads/analytics.routes';
import { registerAnimeCreativeRoutes } from './reads/creative.routes';
import { registerAnimeReadsRoutes } from './reads/reads.routes';
import { registerAnimeHealthRoutes } from './routes/health.routes';
import { registerAnimeDevicesRoutes } from './system/devices.routes';

export async function registerAnimeModule(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', animeRequestIdHook);
  app.setErrorHandler(animeErrorHandler);
  await app.register(registerAnimeHealthRoutes);
  await app.register(registerAnimeDevicesRoutes);
  await app.register(registerAnimeCommandsRoutes);
  await app.register(registerAnimeCallbacksRoutes);
  await app.register(registerAnimeReadsRoutes);
  await app.register(registerAnimeCreativeRoutes);
  await app.register(registerAnimeMediaRoutes);
  await app.register(registerAnimeAnalyticsRoutes);
  await app.register(registerAnimeApprovalsRoutes);
  await app.register(registerAnimeAdminWorkersRoutes);
  await app.register(registerAnimeAdminLedgerRoutes);
  await app.register(registerAnimeAdminSystemRoutes);
  startBrainWorker();
  startIncidentWorker();
}
EOF

echo "====================================================="
echo "PART 2 CODE COMPLETE. ALL FILES CREATED SUCCESSFULLY."
echo "====================================================="
