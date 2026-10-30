cd ~/ai-backend

mkdir -p src/modules/anime/{config,db,errors,middleware,audit,auth,routes,commands,adapters,callbacks,reads,approvals,outbox,supervisor,registry,ledger,admin,test,intelligence,system,media}

cat > src/modules/anime/config/anime.env.ts << 'EOF'
import { z } from 'zod';
export const AnimeProcessRoleEnum = z.enum(['api', 'dispatcher', 'supervisor', 'worker']);
export type AnimeProcessRole = z.infer<typeof AnimeProcessRoleEnum>;
export const animeEnvSchema = z.object({
  ANIME_SUPABASE_URL: z.string().url(), ANIME_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1), ANIME_SUPABASE_ANON_KEY: z.string().min(1),
  ANIME_N8N_CALLBACK_SECRET: z.string().min(1), ANIME_WORKER_CALLBACK_SECRET: z.string().min(1), ANIME_PROCESS_ROLE: AnimeProcessRoleEnum,
});
export type AnimeEnv = z.infer<typeof animeEnvSchema>;
function parseAnimeEnvOnce(rawEnv: NodeJS.ProcessEnv): Readonly<AnimeEnv> {
  const parsed = animeEnvSchema.safeParse(rawEnv);
  if (parsed.success === false) throw new Error('[AnimeEngine] Invalid env: ' + parsed.error.issues.map(i => i.path.join('.')).join(', '));
  return Object.freeze(parsed.data);
}
export const animeEnv: Readonly<AnimeEnv> = parseAnimeEnvOnce(process.env);
EOF

cat > src/modules/anime/db/anime.supabase.ts << 'EOF'
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { animeEnv } from '../config/anime.env';
export const animeSupabase: SupabaseClient = createClient(animeEnv.ANIME_SUPABASE_URL, animeEnv.ANIME_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
EOF

cat > src/modules/anime/errors/anime.errors.ts << 'EOF'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
export enum AnimeErrorCode { AUTH_INVALID = 'AUTH_INVALID', PROJECT_FORBIDDEN = 'PROJECT_FORBIDDEN', VERSION_CONFLICT = 'VERSION_CONFLICT', IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT', MISSING_IDEMPOTENCY = 'MISSING_IDEMPOTENCY', APPROVAL_REQUIRED = 'APPROVAL_REQUIRED', PAID_BUDGET_REQUIRED = 'PAID_BUDGET_REQUIRED', QUOTA_DEFERRED = 'QUOTA_DEFERRED', PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE', STAGE_DEPENDENCY_BLOCKED = 'STAGE_DEPENDENCY_BLOCKED', OUTPUT_INVALID = 'OUTPUT_INVALID', QC_FAILED = 'QC_FAILED', WORKFLOW_CONTRACT_MISMATCH = 'WORKFLOW_CONTRACT_MISMATCH', CALLBACK_REPLAY = 'CALLBACK_REPLAY', CALLBACK_SIGNATURE_INVALID = 'CALLBACK_SIGNATURE_INVALID', MANUAL_REVIEW_REQUIRED = 'MANUAL_REVIEW_REQUIRED', INTERNAL = 'INTERNAL' }
export const ANIME_ERROR_SPEC_MAP: any = { [AnimeErrorCode.AUTH_INVALID]: { httpStatus: 401, defaultRetryable: false }, [AnimeErrorCode.PROJECT_FORBIDDEN]: { httpStatus: 403, defaultRetryable: false }, [AnimeErrorCode.VERSION_CONFLICT]: { httpStatus: 409, defaultRetryable: false }, [AnimeErrorCode.IDEMPOTENCY_CONFLICT]: { httpStatus: 409, defaultRetryable: false }, [AnimeErrorCode.MISSING_IDEMPOTENCY]: { httpStatus: 400, defaultRetryable: false }, [AnimeErrorCode.APPROVAL_REQUIRED]: { httpStatus: 403, defaultRetryable: false }, [AnimeErrorCode.PAID_BUDGET_REQUIRED]: { httpStatus: 402, defaultRetryable: false }, [AnimeErrorCode.QUOTA_DEFERRED]: { httpStatus: 429, defaultRetryable: true }, [AnimeErrorCode.PROVIDER_UNAVAILABLE]: { httpStatus: 503, defaultRetryable: true }, [AnimeErrorCode.STAGE_DEPENDENCY_BLOCKED]: { httpStatus: 409, defaultRetryable: true }, [AnimeErrorCode.OUTPUT_INVALID]: { httpStatus: 422, defaultRetryable: false }, [AnimeErrorCode.QC_FAILED]: { httpStatus: 422, defaultRetryable: false }, [AnimeErrorCode.WORKFLOW_CONTRACT_MISMATCH]: { httpStatus: 502, defaultRetryable: false }, [AnimeErrorCode.CALLBACK_REPLAY]: { httpStatus: 409, defaultRetryable: false }, [AnimeErrorCode.CALLBACK_SIGNATURE_INVALID]: { httpStatus: 401, defaultRetryable: false }, [AnimeErrorCode.MANUAL_REVIEW_REQUIRED]: { httpStatus: 423, defaultRetryable: false }, [AnimeErrorCode.INTERNAL]: { httpStatus: 500, defaultRetryable: true } };
export class AnimeError extends Error {
  public readonly code: AnimeErrorCode; public readonly httpStatus: number; public readonly retryable: boolean;
  constructor(options: { code: AnimeErrorCode, message: string, httpStatus?: number, retryable?: boolean, cause?: unknown }) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AnimeError'; const spec = ANIME_ERROR_SPEC_MAP[options.code] ?? ANIME_ERROR_SPEC_MAP[AnimeErrorCode.INTERNAL];
    this.code = options.code; this.httpStatus = options.httpStatus ?? spec.httpStatus; this.retryable = options.retryable ?? spec.defaultRetryable;
  }
}
export function animeErrorHandler(error: FastifyError | AnimeError | Error, request: FastifyRequest, reply: FastifyReply): void {
  const requestId = (request as any).anime?.request_id ?? randomUUID();
  if (!reply.hasHeader('X-Request-Id')) reply.header('X-Request-Id', requestId);
  if (error instanceof AnimeError) return void reply.status(error.httpStatus).send({ error: { code: error.code, message: error.message, retryable: error.retryable, request_id: requestId } });
  request.log.error({ err: error, request_id: requestId }, '[AnimeEngine] Unhandled error');
  void reply.status(500).send({ error: { code: AnimeErrorCode.INTERNAL, message: 'Internal error.', retryable: true, request_id: requestId } });
}
EOF

cat > src/modules/anime/middleware/request-id.ts << 'EOF'
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
export type AnimeRole = 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer';
export async function animeRequestIdHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const requestId = randomUUID(); (req as any).anime = { ...(req as any).anime, request_id: requestId }; reply.header('X-Request-Id', requestId);
}
EOF

cat > src/modules/anime/audit/audit.writer.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
export interface AuditEntryInput { readonly project_id: string | null; readonly workflow_name: string; readonly action: string; readonly user_id?: string | null; readonly episode_no?: number | null; readonly new_value?: unknown; readonly request_id?: string; }
export async function writeAudit(entry: AuditEntryInput): Promise<void> {
  try { await animeSupabase.from('audit_log').insert({ project_id: entry.project_id, user_id: entry.user_id ?? null, episode_no: entry.episode_no ?? null, workflow_name: entry.workflow_name, action: entry.action, new_value: entry.new_value ?? null }); } catch (err) { console.error('Audit failed', err); }
}
EOF

cat > src/modules/anime/auth/project-guard.ts << 'EOF'
import type { FastifyReply, FastifyRequest } from 'fastify';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
export function requireProjectRole(allowedRoles: string[]) {
  return async function projectRolePreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authCtx = (request as any).authContext;
    const authenticatedUserId = authCtx?.userId;
    if (!authenticatedUserId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Missing auth context.' });
    const projectId = (request.params as any)?.id || (request.params as any)?.project_id || (request.body as any)?.project_id;
    if (!projectId) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Missing project_id.' });
    const { data, error } = await animeSupabase.from('projects').select('id, user_id').eq('id', projectId).single();
    if (error || !data || data.user_id !== authenticatedUserId) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Access denied.' });
    if (!allowedRoles.includes('owner')) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Insufficient role.' });
    (request as any).anime = { ...(request as any).anime, user_id: authenticatedUserId, project_id: projectId, role: 'owner' };
  };
}
EOF

cat > src/modules/anime/routes/health.routes.ts << 'EOF'
import type { FastifyInstance } from 'fastify';
import { animeSupabase } from '../db/anime.supabase';
export async function registerAnimeHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/health', async (_req, reply) => {
    const { error } = await animeSupabase.from('projects').select('id').limit(1);
    void reply.status(error ? 503 : 200); return { ok: !error, db: error ? 'down' : 'up', version: '6.5.0' };
  });
}
EOF

cat > src/modules/anime/commands/commands.types.ts << 'EOF'
export enum CommandIntent { CREATE_PROJECT = 'CREATE_PROJECT', OPEN_PROJECT = 'OPEN_PROJECT', SAVE_BIBLE = 'SAVE_BIBLE', BIBLE_CHAT = 'BIBLE_CHAT', GENERATE_EPISODE = 'GENERATE_EPISODE', REGENERATE_EPISODE = 'REGENERATE_EPISODE', CONTINUE_EPISODE = 'CONTINUE_EPISODE', QUICK_GENERATE_IMAGE = 'QUICK_GENERATE_IMAGE', QUICK_GENERATE_VIDEO = 'QUICK_GENERATE_VIDEO', SAVE_TO_PROJECT = 'SAVE_TO_PROJECT', VISION_ANALYSIS = 'VISION_ANALYSIS', CHANGE_CHARACTER_VOICE = 'CHANGE_CHARACTER_VOICE', PREVIEW_VOICE = 'PREVIEW_VOICE', LIST_VOICES = 'LIST_VOICES', RESET_VOICE = 'RESET_VOICE', CHECK_CANON = 'CHECK_CANON', VIEW_CANON = 'VIEW_CANON', APPROVE_CANON_CHANGE = 'APPROVE_CANON_CHANGE', REJECT_CANON_CHANGE = 'REJECT_CANON_CHANGE', CHECK_CONTINUITY = 'CHECK_CONTINUITY', CHECK_QUOTA = 'CHECK_QUOTA', RETRY_FAILED = 'RETRY_FAILED', VIEW_STATE = 'VIEW_STATE', VIEW_AUDIT = 'VIEW_AUDIT', RUN_QC = 'RUN_QC', PUBLISH_NOW = 'PUBLISH_NOW', VIEW_ANALYTICS = 'VIEW_ANALYTICS', ADMIN_START_KAGGLE = 'ADMIN_START_KAGGLE', ADMIN_STOP_KAGGLE = 'ADMIN_STOP_KAGGLE', ADMIN_STATUS = 'ADMIN_STATUS', DB_TEST = 'DB_TEST', SYSTEM_HEALTH = 'SYSTEM_HEALTH' }
export type WorkflowKey = 'WF-00'|'WF-01'|'WF-02'|'WF-03'|'WF-04'|'WF-05'|'WF-06'|'WF-07'|'WF-08'|'WF-09'|'WF-10'|'WF-11'|'WF-12'|'WF-13';
export const COMMAND_INTENT_WF_MAP: any = { [CommandIntent.CREATE_PROJECT]: 'WF-01', [CommandIntent.OPEN_PROJECT]: 'WF-01', [CommandIntent.SAVE_BIBLE]: 'WF-01', [CommandIntent.BIBLE_CHAT]: 'WF-01', [CommandIntent.GENERATE_EPISODE]: 'WF-02', [CommandIntent.REGENERATE_EPISODE]: 'WF-02', [CommandIntent.CONTINUE_EPISODE]: 'WF-02', [CommandIntent.QUICK_GENERATE_IMAGE]: 'WF-03', [CommandIntent.QUICK_GENERATE_VIDEO]: 'WF-03', [CommandIntent.SAVE_TO_PROJECT]: 'WF-03', [CommandIntent.CHANGE_CHARACTER_VOICE]: 'WF-04', [CommandIntent.PREVIEW_VOICE]: 'WF-04', [CommandIntent.LIST_VOICES]: 'WF-04', [CommandIntent.RESET_VOICE]: 'WF-04', [CommandIntent.VIEW_STATE]: 'WF-04', [CommandIntent.VIEW_AUDIT]: 'WF-04', [CommandIntent.ADMIN_START_KAGGLE]: 'WF-04', [CommandIntent.ADMIN_STOP_KAGGLE]: 'WF-04', [CommandIntent.ADMIN_STATUS]: 'WF-04', [CommandIntent.DB_TEST]: 'WF-04', [CommandIntent.SYSTEM_HEALTH]: 'WF-04', [CommandIntent.VISION_ANALYSIS]: 'WF-05', [CommandIntent.CHECK_CONTINUITY]: 'WF-06', [CommandIntent.PUBLISH_NOW]: 'WF-07', [CommandIntent.VIEW_ANALYTICS]: 'WF-08', [CommandIntent.CHECK_CANON]: 'WF-09', [CommandIntent.VIEW_CANON]: 'WF-09', [CommandIntent.APPROVE_CANON_CHANGE]: 'WF-09', [CommandIntent.REJECT_CANON_CHANGE]: 'WF-09', [CommandIntent.RUN_QC]: 'WF-11', [CommandIntent.CHECK_QUOTA]: 'WF-12', [CommandIntent.RETRY_FAILED]: 'WF-13' };
export enum CommandStatus { QUEUED = 'QUEUED', ACCEPTED = 'ACCEPTED', PERSISTED = 'PERSISTED', DISPATCH_PENDING = 'DISPATCH_PENDING', DISPATCHED = 'DISPATCHED', ACKNOWLEDGED = 'ACKNOWLEDGED', RECONCILING = 'RECONCILING', SUCCEEDED = 'SUCCEEDED', FAILED = 'FAILED', DEFERRED = 'DEFERRED', MANUAL_REVIEW = 'MANUAL_REVIEW' }
export type ExecutionMode = 'QUICK' | 'SAVE';
export interface ApiCommandRecord { readonly id: string; readonly project_id: string; readonly user_id: string; readonly intent: CommandIntent; readonly payload: Record<string, unknown>; readonly status: CommandStatus; readonly idempotency_key: string; readonly body_hash: string; readonly created_at: string; }
export interface OutboxEventRecord { readonly id: string; readonly type: string; readonly payload: Record<string, unknown>; readonly status: string; readonly attempts: number; readonly next_attempt_at: string; readonly last_error: string | null; readonly created_at: string; readonly dispatched_at: string | null; }
EOF

cat > src/modules/anime/commands/commands.schema.ts << 'EOF'
import { Type, type Static } from '@sinclair/typebox';
import { CommandIntent } from './commands.types';
export const ExecutionModeSchema = Type.Union([Type.Literal('QUICK'), Type.Literal('SAVE')]);
export const CreateCommandBodySchema = Type.Object({ intent: Type.Enum(CommandIntent), project_id: Type.String({ format: 'uuid' }), payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())), mode: Type.Optional(ExecutionModeSchema), episode_no: Type.Optional(Type.Integer({ minimum: 1, maximum: 9999 })) }, { additionalProperties: false });
export type CreateCommandBody = Static<typeof CreateCommandBodySchema>;
export const CommandIdParamsSchema = Type.Object({ id: Type.String({ format: 'uuid' }) }, { additionalProperties: false });
export type CommandIdParams = Static<typeof CommandIdParamsSchema>;
EOF

cat > src/modules/anime/commands/commands.repo.ts << 'EOF'
import { randomUUID } from 'node:crypto';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { type ApiCommandRecord, type CommandIntent, CommandStatus } from './commands.types';
export async function findCommandByIdempotencyKey(idempotencyKey: string): Promise<ApiCommandRecord | null> {
  const { data, error } = await animeSupabase.from('api_commands').select('*').eq('idempotency_key', idempotencyKey).maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Query failed', cause: error });
  return data;
}
export async function findCommandById(commandId: string): Promise<ApiCommandRecord | null> {
  const { data, error } = await animeSupabase.from('api_commands').select('*').eq('id', commandId).maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Query failed', cause: error });
  return data;
}
export async function insertCommandAtomic(input: any): Promise<ApiCommandRecord> {
  const commandId = input.command_id ?? randomUUID(); const outboxId = randomUUID(); const status = input.status ?? CommandStatus.QUEUED;
  const rpcResult = await animeSupabase.rpc('insert_anime_command_atomic', { p_command_id: commandId, p_project_id: input.project_id, p_user_id: input.user_id, p_intent: input.intent, p_payload: input.payload, p_status: status, p_idempotency_key: input.idempotency_key, p_body_hash: input.body_hash, p_outbox_id: outboxId, p_outbox_type: input.outbox_type, p_outbox_payload: input.outbox_payload }).maybeSingle();
  if (!rpcResult.error && rpcResult.data) return rpcResult.data;
  if (rpcResult.error && rpcResult.error.code === '23505') { const existing = await findCommandByIdempotencyKey(input.idempotency_key); if (existing) return existing; }
  const { data: insertedCommand, error: cmdError } = await animeSupabase.from('api_commands').insert({ id: commandId, project_id: input.project_id, user_id: input.user_id, intent: input.intent, payload: input.payload, status, idempotency_key: input.idempotency_key, body_hash: input.body_hash }).select().single();
  if (cmdError) { if (cmdError.code === '23505') { const existing = await findCommandByIdempotencyKey(input.idempotency_key); if (existing) return existing; } throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Insert failed', cause: cmdError }); }
  await animeSupabase.from('outbox_events').insert({ id: outboxId, type: input.outbox_type, payload: input.outbox_payload, status: 'pending', attempts: 0 });
  return insertedCommand;
}
EOF

cat > src/modules/anime/commands/commands.service.ts << 'EOF'
import { createHash, randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { retrieveContext } from '../intelligence/memory.service';
import { preflightCheck } from '../intelligence/planner.service';
import { findCommandById, findCommandByIdempotencyKey, insertCommandAtomic } from './commands.repo';
import type { CreateCommandBody } from './commands.schema';
import { type ApiCommandRecord, COMMAND_INTENT_WF_MAP, CommandStatus, type WorkflowKey } from './commands.types';
export async function submitAnimeCommand(params: { idempotencyKey: string | undefined; userId: string; requestId: string; body: CreateCommandBody; }): Promise<any> {
  const rawKey = params.idempotencyKey?.trim();
  if (!rawKey) throw new AnimeError({ code: AnimeErrorCode.MISSING_IDEMPOTENCY, message: 'Header Idempotency-Key is required.' });
  const wfKey = COMMAND_INTENT_WF_MAP[params.body.intent];
  if (!wfKey) throw new AnimeError({ code: AnimeErrorCode.WORKFLOW_CONTRACT_MISMATCH, message: `Unsupported intent: ${String(params.body.intent)}` });
  const bodyHash = createHash('sha256').update(JSON.stringify(params.body)).digest('hex');
  const existing = await findCommandByIdempotencyKey(rawKey);
  if (existing) {
    if (existing.body_hash !== bodyHash || existing.project_id !== params.body.project_id) throw new AnimeError({ code: AnimeErrorCode.IDEMPOTENCY_CONFLICT, message: 'Conflict.' });
    return { command: existing, wf_key: COMMAND_INTENT_WF_MAP[existing.intent], idempotent_replay: true };
  }
  await preflightCheck(params.body.project_id, params.body.intent);
  const memories = await retrieveContext(params.body.project_id, params.body.intent);
  const commandId = randomUUID();
  const enrichedPayload = { ...(params.body.payload ?? {}), mode: params.body.mode ?? 'SAVE', ...(params.body.episode_no !== undefined ? { episode_no: params.body.episode_no } : {}), wf_key: wfKey, request_id: params.requestId, memories };
  const outboxPayload = { command_id: commandId, project_id: params.body.project_id, user_id: params.userId, intent: params.body.intent, wf_key: wfKey, mode: params.body.mode ?? 'SAVE', episode_no: params.body.episode_no ?? null, idempotency_key: rawKey, request_id: params.requestId, payload: enrichedPayload };
  const created = await insertCommandAtomic({ command_id: commandId, project_id: params.body.project_id, user_id: params.userId, intent: params.body.intent, payload: enrichedPayload, status: CommandStatus.QUEUED, idempotency_key: rawKey, body_hash: bodyHash, outbox_type: `ANIME_COMMAND_DISPATCH:${wfKey}`, outbox_payload: outboxPayload });
  if (created.id !== commandId) {
    if (created.body_hash !== bodyHash || created.project_id !== params.body.project_id) throw new AnimeError({ code: AnimeErrorCode.IDEMPOTENCY_CONFLICT, message: 'Concurrent conflict.' });
    return { command: created, wf_key: COMMAND_INTENT_WF_MAP[created.intent], idempotent_replay: true };
  }
  await writeAudit({ project_id: params.body.project_id, user_id: params.userId, episode_no: params.body.episode_no ?? null, workflow_name: wfKey, action: params.body.intent, entity_type: 'API_COMMAND', entity_id: created.id, new_value: { command_id: created.id, status: created.status }, request_id: params.requestId });
  return { command: created, wf_key: wfKey, idempotent_replay: false };
}
export async function getAnimeCommandForUser(commandId: string, userId: string): Promise<ApiCommandRecord> {
  const command = await findCommandById(commandId);
  if (!command || command.user_id !== userId) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Access denied.' });
  return command;
}
EOF

cat > src/modules/anime/adapters/n8n.adapter.ts << 'EOF'
import { createHmac } from 'node:crypto';
import { animeEnv } from '../config/anime.env';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
export function computeN8nHmacSignature(timestampSec: string, rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`, 'utf8').digest('hex')}`;
}
export async function dispatchToWf00(envelope: any, timeoutMs = 15000): Promise<any> {
  const targetUrl = process.env.WF_00_WEBHOOK_URL?.trim() || `${(process.env.N8N_BASE_URL || '').replace(/\/+$/, '')}/webhook/anime-master-router`;
  if (!targetUrl || targetUrl === '/webhook/anime-master-router') throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'WF_00_WEBHOOK_URL missing.', retryable: false });
  const timestampSec = Math.floor(Date.now() / 1000).toString(); const rawBody = JSON.stringify(envelope);
  const signature = computeN8nHmacSignature(timestampSec, rawBody, animeEnv.ANIME_N8N_CALLBACK_SECRET);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(targetUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Anime-Timestamp': timestampSec, 'X-Anime-Signature': signature, 'X-Request-Id': envelope.request_id, 'Idempotency-Key': envelope.idempotency_key }, body: rawBody, signal: controller.signal });
    if (!response.ok) throw new AnimeError({ code: response.status >= 500 ? AnimeErrorCode.PROVIDER_UNAVAILABLE : AnimeErrorCode.WORKFLOW_CONTRACT_MISMATCH, message: `HTTP ${response.status}`, retryable: response.status >= 500 });
    const parsed = await response.json();
    return { ok: true, status: parsed.status || 'ACKNOWLEDGED', execution_id: parsed.execution_id || null, raw: parsed };
  } catch (err: any) {
    if (err instanceof AnimeError) throw err;
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: err.message, retryable: true });
  } finally { clearTimeout(timer); }
}
EOF

cat > src/modules/anime/commands/commands.routes.ts << 'EOF'
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { CommandIdParamsSchema, CreateCommandBodySchema } from './commands.schema';
import { getAnimeCommandForUser, submitAnimeCommand } from './commands.service';
export async function registerAnimeCommandsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/commands', { schema: { body: CreateCommandBodySchema }, preHandler: [requireProjectRole(['owner', 'admin', 'editor'])] }, async (request, reply) => {
    const userId = (request as any).anime?.user_id; if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth missing' });
    const rawKey = request.headers['idempotency-key'] as string;
    const result = await submitAnimeCommand({ idempotencyKey: rawKey, userId, requestId: (request as any).anime?.request_id, body: request.body as any });
    void reply.status(202); return { data: result, meta: { request_id: (request as any).anime?.request_id } };
  });
  app.get('/v1/anime/commands/:id', { schema: { params: CommandIdParamsSchema } }, async (request, reply) => {
    const userId = (request as any).authContext?.userId; if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth missing' });
    const command = await getAnimeCommandForUser((request.params as any).id, userId); void reply.status(200); return { data: command };
  });
}
EOF
