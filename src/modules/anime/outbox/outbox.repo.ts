import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

const STALE_PROCESSING_MINUTES = 10;

export async function recoverStaleProcessing(staleMinutes = STALE_PROCESSING_MINUTES): Promise<number> {
  const cutoff = new Date(Date.now() - staleMinutes * 60000).toISOString();
  const now = new Date().toISOString();
  let result = await animeSupabase
    .from('outbox_events')
    .update({ status: 'pending', processing_started_at: null, next_attempt_at: now, last_error: 'Recovered stale processing lease' })
    .eq('status', 'processing')
    .lt('processing_started_at', cutoff)
    .select('id');
  if (result.error) {
    result = await animeSupabase
      .from('outbox_events')
      .update({ status: 'pending', next_attempt_at: now, last_error: 'Recovered stale processing lease' })
      .eq('status', 'processing')
      .lt('created_at', cutoff)
      .select('id');
  }
  if (result.error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Stale outbox recovery failed', cause: result.error });
  return Array.isArray(result.data) ? result.data.length : 0;
}

export async function claimBatch(type: string, batchSize = 10): Promise<any[]> {
  await recoverStaleProcessing();
  const { data, error } = await animeSupabase.rpc('claim_outbox_batch', { p_type: type, p_batch_size: batchSize });
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Claim failed', cause: error });
  return data ?? [];
}
export async function markDispatched(outboxId: string): Promise<void> { await animeSupabase.from('outbox_events').update({ status: 'dispatched', dispatched_at: new Date().toISOString(), processing_started_at: null, last_error: null }).eq('id', outboxId); }
export async function markFailed(outboxId: string, attempts: number, nextAttemptAtIso: string, lastError: string): Promise<void> { await animeSupabase.from('outbox_events').update({ status: 'pending', attempts, next_attempt_at: nextAttemptAtIso, processing_started_at: null, last_error: lastError.slice(0, 1000) }).eq('id', outboxId); }
export async function markDeadLetter(outboxId: string, attempts: number, lastError: string): Promise<void> { await animeSupabase.from('outbox_events').update({ status: 'dead_letter', attempts, processing_started_at: null, last_error: lastError.slice(0, 1000) }).eq('id', outboxId); }
