cd ~/ai-backend

cat > src/modules/anime/audit/audit.writer.ts << 'EOF'
import { animeSupabase } from '../db/anime.supabase';
export interface AuditEntryInput {
  readonly project_id: string | null;
  readonly workflow_name: string;
  readonly action: string;
  readonly user_id?: string | null;
  readonly episode_no?: number | null;
  readonly entity_type?: string | null;
  readonly entity_id?: string | null;
  readonly previous_value?: unknown;
  readonly new_value?: unknown;
  readonly reason?: string | null;
  readonly execution_id?: string | null;
  readonly request_id?: string;
}
export async function writeAudit(entry: AuditEntryInput): Promise<void> {
  try {
    await animeSupabase.from('audit_log').insert({
      project_id: entry.project_id,
      user_id: entry.user_id ?? null,
      episode_no: entry.episode_no ?? null,
      workflow_name: entry.workflow_name,
      action: entry.action,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      previous_value: entry.previous_value ?? null,
      new_value: entry.new_value ?? null,
      reason: entry.reason ?? null,
      execution_id: entry.execution_id ?? null
    });
  } catch (err) { console.error('Audit failed', err); }
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
    const parsed = await response.json() as any;
    return { ok: true, status: parsed?.status || 'ACKNOWLEDGED', execution_id: parsed?.execution_id || null, raw: parsed || {} };
  } catch (err: any) {
    if (err instanceof AnimeError) throw err;
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: err.message, retryable: true });
  } finally { clearTimeout(timer); }
}
EOF

cat > src/modules/anime/commands/commands.repo.ts << 'EOF'
import { randomUUID } from 'node:crypto';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { type ApiCommandRecord, type CommandIntent, CommandStatus } from './commands.types';
export async function findCommandByIdempotencyKey(idempotencyKey: string): Promise<ApiCommandRecord | null> {
  const { data, error } = await animeSupabase.from('api_commands').select('*').eq('idempotency_key', idempotencyKey).maybeSingle<ApiCommandRecord>();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Query failed', cause: error });
  return data;
}
export async function findCommandById(commandId: string): Promise<ApiCommandRecord | null> {
  const { data, error } = await animeSupabase.from('api_commands').select('*').eq('id', commandId).maybeSingle<ApiCommandRecord>();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Query failed', cause: error });
  return data;
}
export async function insertCommandAtomic(input: any): Promise<ApiCommandRecord> {
  const commandId = input.command_id ?? randomUUID(); const outboxId = randomUUID(); const status = input.status ?? CommandStatus.QUEUED;
  const rpcResult = await animeSupabase.rpc('insert_anime_command_atomic', { p_command_id: commandId, p_project_id: input.project_id, p_user_id: input.user_id, p_intent: input.intent, p_payload: input.payload, p_status: status, p_idempotency_key: input.idempotency_key, p_body_hash: input.body_hash, p_outbox_id: outboxId, p_outbox_type: input.outbox_type, p_outbox_payload: input.outbox_payload }).maybeSingle<ApiCommandRecord>();
  if (!rpcResult.error && rpcResult.data) return rpcResult.data;
  if (rpcResult.error && rpcResult.error.code === '23505') { const existing = await findCommandByIdempotencyKey(input.idempotency_key); if (existing) return existing; }
  const { data: insertedCommand, error: cmdError } = await animeSupabase.from('api_commands').insert({ id: commandId, project_id: input.project_id, user_id: input.user_id, intent: input.intent, payload: input.payload, status, idempotency_key: input.idempotency_key, body_hash: input.body_hash }).select().single<ApiCommandRecord>();
  if (cmdError) { if (cmdError.code === '23505') { const existing = await findCommandByIdempotencyKey(input.idempotency_key); if (existing) return existing; } throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Insert failed', cause: cmdError }); }
  await animeSupabase.from('outbox_events').insert({ id: outboxId, type: input.outbox_type, payload: input.outbox_payload, status: 'pending', attempts: 0 });
  return insertedCommand;
}
EOF
echo "Files fixed successfully!"
