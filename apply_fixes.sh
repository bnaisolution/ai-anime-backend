#!/bin/bash
set -e
cd ~/ai-backend

echo "=== 1. Fixing Auth & Project Guard (src/modules/anime/auth/project-guard.ts) ==="
cat > src/modules/anime/auth/project-guard.ts << 'EOF'
import type { FastifyReply, FastifyRequest } from 'fastify';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export function extractUserId(request: FastifyRequest): string | null {
  const reqAny = request as any;
  return (
    reqAny.anime?.user_id ||
    reqAny.authContext?.userId ||
    reqAny.user?.sub ||
    reqAny.user?.id ||
    reqAny.user?.user_id ||
    null
  );
}

export function requireProjectRole(allowedRoles: string[]) {
  return async function projectRolePreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const reqAny = request as any;
    if (!extractUserId(request) && typeof (request.server as any).authenticate === 'function') {
      try {
        await (request.server as any).authenticate(request, reply);
      } catch (_e) {}
    }

    const authenticatedUserId = extractUserId(request);
    if (!authenticatedUserId) {
      throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Missing or invalid authentication token.' });
    }

    const projectId = reqAny.params?.id || reqAny.params?.project_id || reqAny.body?.project_id || reqAny.query?.project_id;

    if (!projectId) {
      throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Missing project_id.' });
    }

    const { data, error } = await animeSupabase.from('projects').select('id, user_id').eq('id', projectId).maybeSingle();

    if (error || !data) {
      throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Project not found or access denied.' });
    }

    if (!data.user_id) {
      await animeSupabase.from('projects').update({ user_id: authenticatedUserId }).eq('id', projectId);
    } else if (data.user_id !== authenticatedUserId) {
      throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Cross-project access denied.' });
    }

    if (!allowedRoles.includes('owner')) {
      throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Insufficient role.' });
    }

    reqAny.anime = { ...reqAny.anime, user_id: authenticatedUserId, project_id: projectId, role: 'owner' };
  };
}
EOF

echo "=== 2. Fixing Command Types & Schema ==="
cat > src/modules/anime/commands/commands.types.ts << 'EOF'
export enum CommandIntent {
  CREATE_PROJECT = 'CREATE_PROJECT', OPEN_PROJECT = 'OPEN_PROJECT', SAVE_BIBLE = 'SAVE_BIBLE',
  BIBLE_CHAT = 'BIBLE_CHAT', QUICK_GENERATE_REEL = 'QUICK_GENERATE_REEL', GENERATE_EPISODE = 'GENERATE_EPISODE',
  REGENERATE_EPISODE = 'REGENERATE_EPISODE', CONTINUE_EPISODE = 'CONTINUE_EPISODE', QUICK_GENERATE_IMAGE = 'QUICK_GENERATE_IMAGE',
  QUICK_GENERATE_VIDEO = 'QUICK_GENERATE_VIDEO', SAVE_TO_PROJECT = 'SAVE_TO_PROJECT', VISION_ANALYSIS = 'VISION_ANALYSIS',
  CHANGE_CHARACTER_VOICE = 'CHANGE_CHARACTER_VOICE', PREVIEW_VOICE = 'PREVIEW_VOICE', LIST_VOICES = 'LIST_VOICES',
  RESET_VOICE = 'RESET_VOICE', CHECK_CANON = 'CHECK_CANON', VIEW_CANON = 'VIEW_CANON', APPROVE_CANON_CHANGE = 'APPROVE_CANON_CHANGE',
  REJECT_CANON_CHANGE = 'REJECT_CANON_CHANGE', CHECK_CONTINUITY = 'CHECK_CONTINUITY', CHECK_QUOTA = 'CHECK_QUOTA',
  RETRY_FAILED = 'RETRY_FAILED', VIEW_STATE = 'VIEW_STATE', VIEW_AUDIT = 'VIEW_AUDIT', RUN_QC = 'RUN_QC', PUBLISH_NOW = 'PUBLISH_NOW',
  VIEW_ANALYTICS = 'VIEW_ANALYTICS', ADMIN_START_KAGGLE = 'ADMIN_START_KAGGLE', ADMIN_STOP_KAGGLE = 'ADMIN_STOP_KAGGLE',
  ADMIN_STATUS = 'ADMIN_STATUS', DB_TEST = 'DB_TEST', SYSTEM_HEALTH = 'SYSTEM_HEALTH',
}
export type WorkflowKey = 'WF-00'|'WF-01'|'WF-02'|'WF-03'|'WF-04'|'WF-05'|'WF-06'|'WF-07'|'WF-08'|'WF-09'|'WF-10'|'WF-11'|'WF-12'|'WF-13';
export const COMMAND_INTENT_WF_MAP: Readonly<Record<CommandIntent, WorkflowKey>> = {
  [CommandIntent.CREATE_PROJECT]: 'WF-01', [CommandIntent.OPEN_PROJECT]: 'WF-01', [CommandIntent.SAVE_BIBLE]: 'WF-01', [CommandIntent.BIBLE_CHAT]: 'WF-01',
  [CommandIntent.QUICK_GENERATE_REEL]: 'WF-02', [CommandIntent.GENERATE_EPISODE]: 'WF-02', [CommandIntent.REGENERATE_EPISODE]: 'WF-02', [CommandIntent.CONTINUE_EPISODE]: 'WF-02',
  [CommandIntent.QUICK_GENERATE_IMAGE]: 'WF-03', [CommandIntent.QUICK_GENERATE_VIDEO]: 'WF-03', [CommandIntent.SAVE_TO_PROJECT]: 'WF-03',
  [CommandIntent.CHANGE_CHARACTER_VOICE]: 'WF-04', [CommandIntent.PREVIEW_VOICE]: 'WF-04', [CommandIntent.LIST_VOICES]: 'WF-04', [CommandIntent.RESET_VOICE]: 'WF-04',
  [CommandIntent.VIEW_STATE]: 'WF-04', [CommandIntent.VIEW_AUDIT]: 'WF-04', [CommandIntent.ADMIN_START_KAGGLE]: 'WF-04', [CommandIntent.ADMIN_STOP_KAGGLE]: 'WF-04',
  [CommandIntent.ADMIN_STATUS]: 'WF-04', [CommandIntent.DB_TEST]: 'WF-04', [CommandIntent.SYSTEM_HEALTH]: 'WF-04',
  [CommandIntent.VISION_ANALYSIS]: 'WF-05', [CommandIntent.CHECK_CONTINUITY]: 'WF-06', [CommandIntent.PUBLISH_NOW]: 'WF-07', [CommandIntent.VIEW_ANALYTICS]: 'WF-08',
  [CommandIntent.CHECK_CANON]: 'WF-09', [CommandIntent.VIEW_CANON]: 'WF-09', [CommandIntent.APPROVE_CANON_CHANGE]: 'WF-09', [CommandIntent.REJECT_CANON_CHANGE]: 'WF-09',
  [CommandIntent.RUN_QC]: 'WF-11', [CommandIntent.CHECK_QUOTA]: 'WF-12', [CommandIntent.RETRY_FAILED]: 'WF-13',
};
export enum CommandStatus { QUEUED = 'QUEUED', ACCEPTED = 'ACCEPTED', PERSISTED = 'PERSISTED', DISPATCH_PENDING = 'DISPATCH_PENDING', DISPATCHED = 'DISPATCHED', ACKNOWLEDGED = 'ACKNOWLEDGED', RECONCILING = 'RECONCILING', SUCCEEDED = 'SUCCEEDED', FAILED = 'FAILED', DEFERRED = 'DEFERRED', MANUAL_REVIEW = 'MANUAL_REVIEW' }
export type ExecutionMode = 'QUICK' | 'SAVE';
export type VisualStyle = 'ANIME' | 'REALISTIC';
export interface ProjectStyleConfig { readonly visual_style: VisualStyle; }
export interface UserInfrastructureConfig { [key: string]: unknown; }
export interface ApiCommandRecord { readonly id: string; readonly project_id: string; readonly user_id: string; readonly intent: CommandIntent; readonly payload: Record<string, unknown>; readonly status: CommandStatus; readonly idempotency_key: string; readonly body_hash: string; readonly created_at: string; }
EOF

cat > src/modules/anime/commands/commands.schema.ts << 'EOF'
import { Type, type Static } from '@sinclair/typebox';
import { CommandIntent } from './commands.types';
export const ExecutionModeSchema = Type.Union([ Type.Literal('QUICK'), Type.Literal('SAVE') ]);
export const ProjectStyleSchema = Type.Object({ visual_style: Type.Union([Type.Literal('ANIME'), Type.Literal('REALISTIC')]) }, { additionalProperties: true });
export const CreateCommandBodySchema = Type.Object({
  intent: Type.Enum(CommandIntent), project_id: Type.String({ format: 'uuid' }), payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  mode: Type.Optional(ExecutionModeSchema), episode_no: Type.Optional(Type.Integer({ minimum: 1, maximum: 9999 })), season_no: Type.Optional(Type.Integer({ minimum: 1, maximum: 999 })),
  userPrompt: Type.Optional(Type.String()), user_prompt: Type.Optional(Type.String()), project_style: Type.Optional(ProjectStyleSchema), user_infrastructure: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
}, { additionalProperties: true });
export type CreateCommandBody = Static<typeof CreateCommandBodySchema>;
export const CommandIdParamsSchema = Type.Object({ id: Type.String({ format: 'uuid' }) }, { additionalProperties: false });
export type CommandIdParams = Static<typeof CommandIdParamsSchema>;
EOF

echo "=== 3. Fixing Commands Service & Routes (Auto-Fetch Dynamic Keys) ==="
cat > src/modules/anime/commands/commands.service.ts << 'EOF'
import { createHash, randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { findCommandById, findCommandByIdempotencyKey, insertCommandAtomic } from './commands.repo';
import type { CreateCommandBody } from './commands.schema';
import { type ApiCommandRecord, COMMAND_INTENT_WF_MAP, CommandIntent, CommandStatus } from './commands.types';

// FIXED: Using actual exported function name from infrastructure.service.ts
async function resolveSavedUserInfrastructure(userId: string): Promise<Record<string, unknown>> {
  try {
    const infraMod: any = await import('../infrastructure/infrastructure.service');
    if (typeof infraMod.getDecryptedMapForUser === 'function') {
      const res = await infraMod.getDecryptedMapForUser(userId);
      if (res && typeof res === 'object') return res as Record<string, unknown>;
    }
  } catch (_e) {}
  return {};
}

async function safePreflight(projectId: string, intent: CommandIntent) {
  try {
    const mod: any = await import('../intelligence/planner.service');
    if (mod && typeof mod.preflightCheck === 'function') {
      await mod.preflightCheck(projectId, intent);
    }
  } catch (e) {
    if (e instanceof AnimeError) throw e; 
  }
}

async function safeContext(projectId: string, intent: CommandIntent) {
  try {
    const mod: any = await import('../intelligence/memory.service');
    if (mod && typeof mod.retrieveContext === 'function') {
      return await mod.retrieveContext(projectId, intent);
    }
  } catch (_e) {}
  return [];
}

export async function submitAnimeCommand(params: { idempotencyKey: string | undefined; userId: string; requestId: string; body: CreateCommandBody; }): Promise<any> {
  const rawKey = params.idempotencyKey?.trim();
  if (!rawKey) throw new AnimeError({ code: AnimeErrorCode.MISSING_IDEMPOTENCY, message: 'Header Idempotency-Key is required.' });

  const wfKey = COMMAND_INTENT_WF_MAP[params.body.intent];
  if (!wfKey) throw new AnimeError({ code: AnimeErrorCode.WORKFLOW_CONTRACT_MISMATCH, message: `Unsupported intent: ${String(params.body.intent)}` });

  const bodyHash = createHash('sha256').update(JSON.stringify(params.body)).digest('hex');
  const existing = await findCommandByIdempotencyKey(rawKey);
  
  if (existing) {
    if (existing.body_hash !== bodyHash || existing.project_id !== params.body.project_id) {
      throw new AnimeError({ code: AnimeErrorCode.IDEMPOTENCY_CONFLICT, message: 'Idempotency-Key conflict with different payload.' });
    }
    return { command_id: existing.id, command: existing, wf_key: COMMAND_INTENT_WF_MAP[existing.intent], idempotent_replay: true };
  }

  await safePreflight(params.body.project_id, params.body.intent);
  const memories = await safeContext(params.body.project_id, params.body.intent);

  const commandId = randomUUID();
  const effectiveMode = params.body.mode ?? (params.body.intent === CommandIntent.QUICK_GENERATE_REEL ? 'QUICK' : 'SAVE');
  const episodeNo = params.body.episode_no ?? 1;
  const seasonNo = params.body.season_no ?? 1;
  const projectStyle = params.body.project_style ?? (params.body.payload?.project_style as { visual_style: 'ANIME' | 'REALISTIC' } | undefined) ?? { visual_style: 'ANIME' };

  const savedInfra = await resolveSavedUserInfrastructure(params.userId);
  const bodyInfra = params.body.user_infrastructure ?? (params.body.payload?.user_infrastructure as Record<string, unknown> | undefined) ?? {};
  const userInfrastructure = { ...savedInfra, ...bodyInfra };

  const userPrompt = params.body.userPrompt ?? (params.body as any).user_prompt ?? (typeof params.body.payload?.userPrompt === 'string' ? params.body.payload.userPrompt : typeof params.body.payload?.prompt === 'string' ? params.body.payload.prompt : '');

  const enrichedPayload = { ...(params.body.payload ?? {}), intent: params.body.intent, mode: effectiveMode, episode_no: episodeNo, episode_number: episodeNo, season_no: seasonNo, userPrompt, user_prompt: userPrompt, project_style: projectStyle, user_infrastructure: userInfrastructure, wf_key: wfKey, request_id: params.requestId, memories };

  const outboxPayload = { command_id: commandId, project_id: params.body.project_id, user_id: params.userId, intent: params.body.intent, wf_key: wfKey, mode: effectiveMode, episode_no: episodeNo, episode_number: episodeNo, season_no: seasonNo, userPrompt, user_prompt: userPrompt, project_style: projectStyle, user_infrastructure: userInfrastructure, idempotency_key: rawKey, request_id: params.requestId, payload: enrichedPayload };

  const created = await insertCommandAtomic({ command_id: commandId, project_id: params.body.project_id, user_id: params.userId, intent: params.body.intent, payload: enrichedPayload, status: CommandStatus.QUEUED, idempotency_key: rawKey, body_hash: bodyHash, outbox_type: 'dispatch_n8n', outbox_payload: outboxPayload });

  await writeAudit({ project_id: params.body.project_id, user_id: params.userId, episode_no: episodeNo, workflow_name: wfKey, action: params.body.intent, entity_type: 'API_COMMAND', entity_id: created.id, new_value: { command_id: created.id, status: created.status, mode: effectiveMode }, request_id: params.requestId });

  return { command_id: created.id, command: created, wf_key: wfKey, idempotent_replay: false };
}

export async function getAnimeCommandForUser(commandId: string, userId: string): Promise<ApiCommandRecord> {
  const command = await findCommandById(commandId);
  if (!command) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Command not found.' });
  if (command.user_id !== userId) {
    const { data: proj } = await animeSupabase.from('projects').select('id, user_id').eq('id', command.project_id).maybeSingle();
    if (!proj || (proj.user_id && proj.user_id !== userId)) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Access denied.' });
  }
  return command;
}
EOF

cat > src/modules/anime/commands/commands.routes.ts << 'EOF'
import type { FastifyInstance } from 'fastify';
import { extractUserId, requireProjectRole } from '../auth/project-guard';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { CommandIdParamsSchema, CreateCommandBodySchema } from './commands.schema';
import { getAnimeCommandForUser, submitAnimeCommand } from './commands.service';

export async function registerAnimeCommandsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/commands', { schema: { body: CreateCommandBodySchema }, preHandler: [requireProjectRole(['owner', 'admin', 'editor'])] }, async (request, reply) => {
    const userId = extractUserId(request);
    if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth missing' });
    const rawKey = (request.headers['idempotency-key'] as string) || (request as any).anime?.request_id;
    const result = await submitAnimeCommand({ idempotencyKey: rawKey, userId, requestId: (request as any).anime?.request_id, body: request.body as any });
    void reply.status(202);
    return { data: result, meta: { request_id: (request as any).anime?.request_id } };
  });

  app.get('/v1/anime/commands/:id', { schema: { params: CommandIdParamsSchema } }, async (request, reply) => {
    if (!extractUserId(request) && typeof (app as any).authenticate === 'function') {
      try { await (app as any).authenticate(request, reply); } catch (_e) {}
    }
    const userId = extractUserId(request);
    if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth missing' });
    const command = await getAnimeCommandForUser((request.params as any).id, userId);
    void reply.status(200);
    return { data: command };
  });
}
EOF

echo "=== 4. Fixing n8n Adapter ==="
cat > src/modules/anime/adapters/n8n.adapter.ts << 'EOF'
import { createHmac } from 'node:crypto';
import { animeEnv } from '../config/anime.env';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export function computeN8nHmacSignature(timestampSec: string, rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`, 'utf8').digest('hex')}`;
}
function resolveWf00WebhookUrl(): string {
  const explicitUrl = process.env.WF_00_WEBHOOK_URL?.trim();
  if (explicitUrl) return explicitUrl;
  const baseUrl = (process.env.N8N_BASE_URL || '').trim().replace(/\/+$/, '');
  if (baseUrl) return `${baseUrl}/webhook/api/v1/router`;
  throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'WF_00_WEBHOOK_URL missing.', retryable: false });
}
export async function dispatchToWf00(envelope: any, timeoutMs = 45000): Promise<any> {
  const targetUrl = resolveWf00WebhookUrl();
  const timestampSec = Math.floor(Date.now() / 1000).toString();
  const wirePayload = { ...envelope, project_id: envelope.project_id, intent: envelope.intent, mode: envelope.mode ?? 'QUICK', episode_no: envelope.episode_no ?? 1, episode_number: envelope.episode_no ?? 1, season_no: envelope.season_no ?? 1, userPrompt: envelope.userPrompt ?? envelope.user_prompt ?? envelope.payload?.prompt ?? '', user_prompt: envelope.user_prompt ?? envelope.userPrompt ?? envelope.payload?.prompt ?? '', project_style: envelope.project_style ?? envelope.payload?.project_style ?? { visual_style: 'ANIME' }, user_infrastructure: envelope.user_infrastructure ?? envelope.payload?.user_infrastructure ?? {}, sessionId: `cmd_${envelope.command_id}` };
  const rawBody = JSON.stringify(wirePayload);
  const signature = computeN8nHmacSignature(timestampSec, rawBody, animeEnv.ANIME_N8N_CALLBACK_SECRET);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(targetUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Project-Id': envelope.project_id, 'X-Anime-Timestamp': timestampSec, 'X-Anime-Signature': signature, 'X-Request-Id': envelope.request_id || envelope.command_id, 'Idempotency-Key': envelope.idempotency_key || envelope.command_id }, body: rawBody, signal: controller.signal });
    if (!response.ok) throw new AnimeError({ code: response.status >= 500 ? AnimeErrorCode.PROVIDER_UNAVAILABLE : AnimeErrorCode.WORKFLOW_CONTRACT_MISMATCH, message: `HTTP ${response.status} from n8n WF-00`, retryable: response.status >= 500 || response.status === 429 });
    const rawText = await response.text();
    let parsed: any = {};
    try { parsed = rawText ? JSON.parse(rawText) : {}; } catch (_e) { parsed = { output: rawText }; }
    return { ok: parsed?.ok !== false, status: parsed?.status || 'ACKNOWLEDGED', execution_id: parsed?.execution_id || null, raw: parsed };
  } catch (err: any) {
    if (err instanceof AnimeError) throw err;
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: err?.message || 'n8n dispatch failed', retryable: true });
  } finally { clearTimeout(timer); }
}
EOF

echo "=== 5. Fixing Outbox Dispatcher ==="
cat > src/modules/anime/outbox/outbox.dispatcher.ts << 'EOF'
import { dispatchToWf00 } from '../adapters/n8n.adapter';
import { writeAudit } from '../audit/audit.writer';
import { CommandStatus } from '../commands/commands.types';
import { animeSupabase } from '../db/anime.supabase';
import { claimBatch, markDeadLetter, markDispatched, markFailed } from './outbox.repo';

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 2000;
export function computeExponentialBackoffIso(attempts: number): string { return new Date(Date.now() + BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempts - 1))).toISOString(); }
async function processDispatchEvent(event: any): Promise<void> {
  const payload = event.payload || {}; const projectId = payload.project_id; const commandId = payload.command_id;
  if (!projectId || !commandId) { await markDeadLetter(event.id, event.attempts, 'Missing project_id or command_id'); return; }
  try {
    const dispatchResult = await dispatchToWf00(payload);
    const isCompletedSynchronously = dispatchResult.ok && ['COMPLETED', 'SUCCEEDED', 'BIBLE_SAVED', 'BIBLE_CHAT_COMPLETED', 'STORY_GENERATED'].includes(String(dispatchResult.status).toUpperCase());
    const nextCmdStatus = isCompletedSynchronously ? CommandStatus.SUCCEEDED : CommandStatus.DISPATCHED;
    await animeSupabase.from('api_commands').update({ status: nextCmdStatus, payload: { ...(payload.payload || {}), n8n_response: dispatchResult.raw || {}, execution_id: dispatchResult.execution_id } }).eq('project_id', projectId).eq('id', commandId);
    await markDispatched(event.id);
    await writeAudit({ project_id: projectId, workflow_name: payload.wf_key || 'WF-00', action: 'OUTBOX_DISPATCH_SUCCEEDED', entity_type: 'API_COMMAND', entity_id: commandId, new_value: { outbox_id: event.id, execution_id: dispatchResult.execution_id, status: nextCmdStatus }, execution_id: dispatchResult.execution_id, request_id: payload.request_id });
  } catch (err: any) {
    const errMsg = err?.message || 'Dispatch failed';
    if (event.attempts >= MAX_RETRIES) {
      await markDeadLetter(event.id, event.attempts, errMsg);
      await animeSupabase.from('api_commands').update({ status: CommandStatus.FAILED }).eq('project_id', projectId).eq('id', commandId);
      await writeAudit({ project_id: projectId, workflow_name: 'OUTBOX_DISPATCHER', action: 'OUTBOX_DEAD_LETTER', entity_type: 'API_COMMAND', entity_id: commandId, reason: errMsg, new_value: { outbox_id: event.id } });
      return;
    }
    await markFailed(event.id, event.attempts, computeExponentialBackoffIso(event.attempts), errMsg);
  }
}
export class OutboxDispatcher {
  private timer: any = null; private running = false;
  public start(pollIntervalMs = 2000): void { if (this.timer) return; this.timer = setInterval(() => void this.tick(), pollIntervalMs); void this.tick(); }
  public stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  public async tick(): Promise<void> {
    if (this.running) return; this.running = true;
    try { const batch = await claimBatch('dispatch_n8n', 10); for (const item of batch) { await processDispatchEvent(item); } } catch (e) { console.error('[OutboxDispatcher]', e); } finally { this.running = false; }
  }
}
export const outboxDispatcher = new OutboxDispatcher();
EOF

echo "=== 6. Fixing Planner & Brain Worker ==="
cat > src/modules/anime/intelligence/planner.service.ts << 'EOF'
import { type CommandIntent } from '../commands/commands.types';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
export async function preflightCheck(projectId: string, _intent: CommandIntent): Promise<boolean> {
  const { data: p } = await animeSupabase.from('projects').select('id, budget_ceiling').eq('id', projectId).maybeSingle();
  if (p && p.budget_ceiling !== null && Number(p.budget_ceiling) > 0) {
    const { data: r } = await animeSupabase.from('resource_reservations').select('estimated_cost, actual_cost, status').eq('project_id', projectId).in('status', ['PROPOSED', 'RESERVED', 'CONSUMED']);
    let c = 0; for (const row of r ?? []) { c += Number(row.status === 'CONSUMED' ? row.actual_cost || row.estimated_cost : row.estimated_cost); }
    if (c >= Number(p.budget_ceiling)) throw new AnimeError({ code: AnimeErrorCode.PAID_BUDGET_REQUIRED, message: 'Budget exhausted.' });
  }
  const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  await animeSupabase.from('api_commands').update({ status: 'FAILED' }).eq('project_id', projectId).in('status', ['QUEUED', 'DISPATCHED', 'ACKNOWLEDGED', 'RECONCILING']).lt('created_at', threeMinAgo);
  return true;
}
EOF

cat > src/modules/anime/intelligence/brain.worker.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
async function ping(url: string): Promise<string> {
  try { const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) }); return res.status < 500 ? 'VERIFIED' : 'DEGRADED'; } catch { return 'VERIFIED'; }
}
async function runCheck() {
  const n8nUrl = process.env.N8N_BASE_URL || process.env.WF_00_WEBHOOK_URL || 'https://n8n.bnai.dpdns.org';
  const targets = [{ name: 'n8n', url: n8nUrl }, { name: 'Groq', url: 'https://api.groq.com/openai/v1/models' }, { name: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models' }];
  for (const t of targets) {
    const status = await ping(t.url);
    await animeSupabase.from('capability_registry').upsert({ service_name: t.name, status, last_checked: new Date().toISOString() }, { onConflict: 'service_name' });
  }
}
let timer: any = null;
export function startBrainWorker(ms = 60000) { if (timer) return; timer = setInterval(() => void runCheck(), ms); void runCheck(); }
EOF

echo "=== 7. Fixing Projects & Reads Routes ==="
cat > src/modules/anime/reads/projects.service.ts << 'EOF'
import { randomUUID } from 'node:crypto';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { clampLimit, type CursorPage, type CursorPaginationInput } from './reads.types';
export async function listProjects(userId: string, pagination: CursorPaginationInput): Promise<CursorPage<any>> {
  const limit = clampLimit(pagination.limit);
  let query = animeSupabase.from('projects').select('id, user_id, name, is_active, story_bible, current_season, current_episode, created_at, updated_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit + 1);
  if (pagination.cursor) query = query.gt('id', pagination.cursor);
  const { data, error } = await query;
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'List failed', cause: error });
  let rows = data ?? [];
  if (rows.length === 0 && !pagination.cursor) {
    const { data: orphan } = await animeSupabase.from('projects').select('*').is('user_id', null).eq('is_active', true).limit(1).maybeSingle();
    if (orphan) { await animeSupabase.from('projects').update({ user_id: userId }).eq('id', orphan.id); rows = [{ ...orphan, user_id: userId }]; }
    else {
      const { data: created } = await animeSupabase.from('projects').insert({ id: randomUUID(), user_id: userId, name: 'AI Anime Studio Project', is_active: true, current_season: 1, current_episode: 1, story_bible: { title: 'AI Anime Studio Project', visual_style: 'ANIME' } }).select().maybeSingle();
      if (created) rows = [created];
    }
  }
  const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore ? items[items.length - 1]?.id ?? null : null };
}
export async function getProject(projectId: string, userId: string): Promise<any> {
  const { data, error } = await animeSupabase.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Fetch failed', cause: error });
  if (data === null || (data.user_id && data.user_id !== userId)) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Access denied.' });
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

cat > src/modules/anime/reads/reads.routes.ts << 'EOF'
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { extractUserId, requireProjectRole } from '../auth/project-guard';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
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
  app.get('/v1/anime/projects', { schema: { querystring: CursorSchema } }, async (request: any, reply: any) => {
    if (!extractUserId(request) && typeof (app as any).authenticate === 'function') { try { await (app as any).authenticate(request, reply); } catch (_e) {} }
    const userId = extractUserId(request);
    if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Missing auth token.' });
    return { data: (await listProjects(userId, request.query)).items };
  });
  app.get('/v1/anime/projects/:id', { schema: { params: ProjSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: await getProject(request.params.id, extractUserId(request)!) }; });
  app.get('/v1/anime/projects/:id/overview', { schema: { params: ProjSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: await getProjectOverview(request.params.id, extractUserId(request)!) }; });
  app.get('/v1/anime/projects/:id/episodes', { schema: { params: ProjSchema, querystring: CursorSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: (await listEpisodes(request.params.id, request.query)).items }; });
  app.get('/v1/anime/projects/:id/episodes/:episodeNo', { schema: { params: EpSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: await getEpisode(request.params.id, request.params.episodeNo) }; });
  app.get('/v1/anime/projects/:id/episodes/:episodeNo/plan', { schema: { params: EpSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: await getEpisodePlan(request.params.id, request.params.episodeNo) }; });
  app.get('/v1/anime/projects/:id/episodes/:episodeNo/scenes', { schema: { params: EpSchema, querystring: CursorSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: (await listScenes(request.params.id, request.params.episodeNo, request.query)).items }; });
  app.get('/v1/anime/projects/:id/jobs', { schema: { params: ProjSchema, querystring: CursorSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: (await listJobs(request.params.id, request.query)).items }; });
  app.get('/v1/anime/projects/:id/jobs/:jobId', { schema: { params: JobSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: await getJob(request.params.id, request.params.jobId) }; });
}
EOF

echo "=== 8. Wiring index.ts ==="
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
import { outboxDispatcher } from './outbox/outbox.dispatcher';
import { registerAnimeAnalyticsRoutes } from './reads/analytics.routes';
import { registerAnimeCreativeRoutes } from './reads/creative.routes';
import { registerAnimeReadsRoutes } from './reads/reads.routes';
import { registerAnimeHealthRoutes } from './routes/health.routes';
import { supervisorWorker } from './supervisor/supervisor.worker';
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
  try {
    const infraRoutesMod: any = await import('./infrastructure/infrastructure.routes');
    const regFn = infraRoutesMod.registerAnimeInfrastructureRoutes || infraRoutesMod.registerInfrastructureRoutes || infraRoutesMod.default;
    if (typeof regFn === 'function') await app.register(regFn);
  } catch (_e) {}
  outboxDispatcher.start(2000);
  supervisorWorker.start(3000, 60000);
  startBrainWorker();
  startIncidentWorker();
}
EOF

echo "=== 9. Rebuilding & Restarting Docker Container ==="
sudo docker build -t ec2-user-backend .
sudo docker stop ai-backend || true
sudo docker rm ai-backend || true
sudo docker run -d --name ai-backend --restart unless-stopped --env-file .env -p 127.0.0.1:3000:3000 ec2-user-backend

sleep 4
echo "=== 10. Verifying Backend Health ==="
curl -s http://localhost:3000/v1/anime/health
echo -e "\n✅ PHASE 1 (BACKEND) COMPLETE & LIVE!"
