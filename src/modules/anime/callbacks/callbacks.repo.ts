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
