import { dispatchToWf00 } from '../adapters/n8n.adapter';
import { writeAudit } from '../audit/audit.writer';
import { CommandStatus } from '../commands/commands.types';
import { insertCommandAtomic } from '../commands/commands.repo';
import { animeSupabase } from '../db/anime.supabase';
import { getHydratedInfrastructureForUser } from '../infrastructure/infrastructure.service';
import { ensureKaggleWorkerForUser } from '../infrastructure/infrastructure.routes';
import { redactSensitivePayload } from '../../../security/payloadRedaction';
import { claimBatch, markDeadLetter, markDispatched, markFailed, redactExpiredPayloads } from './outbox.repo';

const MAX_RETRIES = 5;
const GPU_INTENTS = new Set(['GENERATE_EPISODE', 'REGENERATE_EPISODE', 'CONTINUE_EPISODE']);

async function maybeStartGpu(payload: any, userId: string): Promise<void> {
  const intent = String(payload?.intent || '').toUpperCase();
  if (!GPU_INTENTS.has(intent)) return;
  const routing = payload?.gpu_routing || payload?.user_infrastructure?.gpu_routing || {};
  if (String(routing.preferred_mode || '').toUpperCase() === 'CUSTOM_GPU') return;
  try {
    const tenantId = payload?.tenant_id || payload?.user_infrastructure?.tenant_id || null;
    await ensureKaggleWorkerForUser(userId, tenantId);
  } catch (error) {
    console.warn('[OutboxDispatcher] Kaggle ensure skipped', error instanceof Error ? error.message : error);
  }
}
const BASE_BACKOFF_MS = 2000;
export function computeExponentialBackoffIso(attempts: number): string { return new Date(Date.now() + BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempts - 1))).toISOString(); }

export async function hydrateDispatchPayload(payload: any): Promise<any> {
  const userId = payload?.user_id;
  if (!userId || typeof userId !== 'string') return payload;
  const userInfrastructure = await getHydratedInfrastructureForUser(userId);
  const gpuRouting = userInfrastructure.gpu_routing ?? {};
  const telegramStorage = userInfrastructure.telegram_storage ?? {};
  const nestedPayload = payload.payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload) ? payload.payload : {};
  return {
    ...payload,
    user_infrastructure: userInfrastructure,
    gpu_routing: gpuRouting,
    telegram_storage: telegramStorage,
    payload: {
      ...nestedPayload,
      user_infrastructure: userInfrastructure,
      gpu_routing: gpuRouting,
      telegram_storage: telegramStorage,
    },
  };
}

export function buildPersistedCommandPayload(payload: any, dispatchResult: any): Record<string, any> {
  const source = payload && typeof payload === 'object' ? payload : {};
  const nested = source.payload && typeof source.payload === 'object' && !Array.isArray(source.payload) ? source.payload : {};
  const { payload: _nested, ...flat } = source;
  return redactSensitivePayload({
    ...nested,
    ...flat,
    n8n_response: dispatchResult?.raw || {},
    execution_id: dispatchResult?.execution_id ?? null,
  });
}

async function processDispatchEvent(event: any): Promise<void> {
  const payload = event.payload || {}; const projectId = payload.project_id; const commandId = payload.command_id;
  if (!projectId || !commandId) { await markDeadLetter(event.id, event.attempts, 'Missing project_id or command_id'); return; }
  try {
    const dispatchPayload = await hydrateDispatchPayload(payload);
    if (typeof payload.user_id === 'string' && payload.user_id) await maybeStartGpu(dispatchPayload, payload.user_id);
    const dispatchResult = await dispatchToWf00(dispatchPayload);
    const isCompletedSynchronously = dispatchResult.ok && ['COMPLETED', 'SUCCEEDED'].includes(String(dispatchResult.status).toUpperCase());
    const nextCmdStatus = isCompletedSynchronously ? CommandStatus.SUCCEEDED : CommandStatus.DISPATCHED;
    const persistedCommandPayload = buildPersistedCommandPayload(payload, dispatchResult);
    await animeSupabase.from('api_commands').update({ status: nextCmdStatus, payload: persistedCommandPayload }).eq('project_id', projectId).eq('id', commandId);
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
export async function processAutoQcEnqueueEvent(event: any): Promise<void> {
  const payload = event.payload || {};
  const projectId = payload.project_id;
  const commandId = payload.command_id;
  if (!projectId || !commandId || !payload.idempotency_key) {
    await markDeadLetter(event.id, event.attempts, 'Missing project_id, command_id, or idempotency_key');
    return;
  }
  try {
    await insertCommandAtomic({
      command_id: commandId,
      project_id: projectId,
      user_id: payload.user_id,
      intent: payload.intent || 'RUN_QC',
      payload: redactSensitivePayload(payload.command_payload || {}),
      status: CommandStatus.QUEUED,
      idempotency_key: payload.idempotency_key,
      body_hash: payload.body_hash,
      outbox_type: payload.outbox_type || 'dispatch_n8n',
      outbox_payload: redactSensitivePayload(payload.outbox_payload || {}),
    });
    await markDispatched(event.id);
    await writeAudit({
      project_id: projectId,
      workflow_name: 'SUPERVISOR_AUTO_QC',
      action: 'AUTO_QC_RETRY_ENQUEUED',
      entity_type: 'API_COMMAND',
      entity_id: commandId,
      new_value: {
        parent_command_id: payload.parent_command_id,
        season_no: payload.season_no,
        episode_no: payload.episode_no,
      },
    });
  } catch (err: any) {
    const errMsg = err?.message || 'Auto-QC retry enqueue failed';
    if (event.attempts >= MAX_RETRIES) {
      await markDeadLetter(event.id, event.attempts, errMsg);
      await writeAudit({
        project_id: projectId,
        workflow_name: 'SUPERVISOR_AUTO_QC',
        action: 'AUTO_QC_RETRY_DEAD_LETTER',
        entity_type: 'API_COMMAND',
        entity_id: commandId,
        reason: errMsg,
        new_value: { outbox_id: event.id },
      });
      return;
    }
    await markFailed(event.id, event.attempts, computeExponentialBackoffIso(event.attempts), errMsg);
  }
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class OutboxDispatcher {
  private timer: any = null; private running = false; private lastRedactionAt = 0;
  public start(pollIntervalMs = 10000): void { if (this.timer) return; this.timer = setInterval(() => void this.tick(), pollIntervalMs); void this.tick(); }
  public stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  public async tick(): Promise<void> {
    if (this.running) return; this.running = true;
    try {
      const redactionIntervalMs = positiveNumber(process.env.ANIME_PAYLOAD_REDACTION_INTERVAL_MS, 15 * 60 * 1000);
      if (Date.now() - this.lastRedactionAt >= redactionIntervalMs) {
        this.lastRedactionAt = Date.now();
        const retentionHours = positiveNumber(process.env.ANIME_PAYLOAD_REDACTION_TTL_HOURS, 24);
        try { await redactExpiredPayloads(retentionHours); } catch (e) { console.error('[OutboxDispatcher] payload redaction', e); }
      }
      const batch = await claimBatch('dispatch_n8n', 10);
      for (const item of batch) { await processDispatchEvent(item); }
      const autoQcBatch = await claimBatch('auto_qc_enqueue', 10);
      for (const item of autoQcBatch) { await processAutoQcEnqueueEvent(item); }
    } catch (e) { console.error('[OutboxDispatcher]', e); } finally { this.running = false; }
  }
}
export const outboxDispatcher = new OutboxDispatcher();
