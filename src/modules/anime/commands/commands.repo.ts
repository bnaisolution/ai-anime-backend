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
