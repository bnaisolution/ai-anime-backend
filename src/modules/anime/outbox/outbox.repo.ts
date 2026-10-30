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
