import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { clampLimit, type CursorPage, type CursorPaginationInput } from './reads.types';
export async function listEpisodes(projectId: string, pagination: CursorPaginationInput): Promise<CursorPage<any>> {
  const limit = clampLimit(pagination.limit);
  let query = animeSupabase.from('episodes').select('id, project_id, episode_no, title, current_state, qc_status, synopsis, created_at, updated_at').eq('project_id', projectId).order('episode_no', { ascending: true }).limit(limit + 1);
  if (pagination.cursor) { const cursorEpNo = Number(pagination.cursor); if (Number.isNaN(cursorEpNo) === false) query = query.gt('episode_no', cursorEpNo); }
  const { data, error } = await query;
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'List failed', cause: error });
  const rows = data ?? []; const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore && items.length > 0 ? String(items[items.length - 1].episode_no) : null };
}
export async function getEpisode(projectId: string, episodeNo: number): Promise<any> {
  const { data, error } = await animeSupabase.from('episodes').select('id, project_id, episode_no, title, current_state, qc_status, synopsis, created_at, updated_at').eq('project_id', projectId).eq('episode_no', episodeNo).maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Fetch failed', cause: error });
  if (data === null) throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, httpStatus: 404, message: `Episode ${episodeNo} not found.` });
  return data;
}
export async function getEpisodePlan(projectId: string, episodeNo: number): Promise<any> {
  const episode = await getEpisode(projectId, episodeNo);
  const [stateRes, scenesRes] = await Promise.all([
    animeSupabase.from('episode_states').select('*').eq('project_id', projectId).eq('episode_no', episodeNo).maybeSingle(),
    animeSupabase.from('scenes').select('id, project_id, episode_no, scene_order, description, visual_prompt, status, created_at').eq('project_id', projectId).eq('episode_no', episodeNo).order('scene_order', { ascending: true }),
  ]);
  const scenes = (scenesRes.data ?? []).map((s: any) => ({ ...s, clips: [] }));
  return { project_id: projectId, episode, state_detail: stateRes.data ?? null, scenes_count: scenes.length, scenes };
}
