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
    const { data: freshEvent } = await animeSupabase.from('outbox_events').select('status').eq('id', event.id).maybeSingle();
    if (freshEvent?.status !== 'processing') { return; } // idempotency_check
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
