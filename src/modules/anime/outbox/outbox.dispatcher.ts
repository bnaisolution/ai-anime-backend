import { dispatchToWf00 } from '../adapters/n8n.adapter';
import { writeAudit } from '../audit/audit.writer';
import { CommandStatus } from '../commands/commands.types';
import { animeSupabase } from '../db/anime.supabase';
import { getHydratedInfrastructureForUser } from '../infrastructure/infrastructure.service';
import { redactSensitivePayload } from '../../../security/payloadRedaction';
import { claimBatch, markDeadLetter, markDispatched, markFailed, redactExpiredPayloads } from './outbox.repo';

const MAX_RETRIES = 5;
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

async function processDispatchEvent(event: any): Promise<void> {
  const payload = event.payload || {}; const projectId = payload.project_id; const commandId = payload.command_id;
  if (!projectId || !commandId) { await markDeadLetter(event.id, event.attempts, 'Missing project_id or command_id'); return; }
  try {
    const dispatchPayload = await hydrateDispatchPayload(payload);
    const dispatchResult = await dispatchToWf00(dispatchPayload);
    const isCompletedSynchronously = dispatchResult.ok && ['COMPLETED', 'SUCCEEDED'].includes(String(dispatchResult.status).toUpperCase());
    const nextCmdStatus = isCompletedSynchronously ? CommandStatus.SUCCEEDED : CommandStatus.DISPATCHED;
    const persistedCommandPayload = redactSensitivePayload({ ...(payload.payload || {}), n8n_response: dispatchResult.raw || {}, execution_id: dispatchResult.execution_id });
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
export class OutboxDispatcher {
  private timer: any = null; private running = false;
  public start(pollIntervalMs = 2000): void { if (this.timer) return; this.timer = setInterval(() => void this.tick(), pollIntervalMs); void this.tick(); }
  public stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  public async tick(): Promise<void> {
    if (this.running) return; this.running = true;
    try {
      const retentionHours = Number(process.env.ANIME_PAYLOAD_REDACTION_TTL_HOURS ?? 24);
      try { await redactExpiredPayloads(Number.isFinite(retentionHours) && retentionHours > 0 ? retentionHours : 24); } catch (e) { console.error('[OutboxDispatcher] payload redaction', e); }
      const batch = await claimBatch('dispatch_n8n', 10);
      for (const item of batch) { await processDispatchEvent(item); }
    } catch (e) { console.error('[OutboxDispatcher]', e); } finally { this.running = false; }
  }
}
export const outboxDispatcher = new OutboxDispatcher();
