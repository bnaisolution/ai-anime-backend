import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { clampLimit, type CursorPage, type CursorPaginationInput } from './reads.types';
import { mintMediaPlaybackToken } from '../media/telegram.playback';

function withPlayback(row: any, projectId: string, userId: string): any {
  const media = row && typeof row.output_media === 'object' && row.output_media ? row.output_media : {};
  const fileId = row?.telegram_file_id || media.telegram_file_id || '';
  let masterVideoUrl = media.final_video_url || media.master_video_url || null;
  if (fileId && userId) {
    try {
      const playbackBase = String(process.env.ANIME_PUBLIC_BASE_URL || 'https://api.bnai.dpdns.org').replace(/\/+$/, '');
      const token = mintMediaPlaybackToken({ fileId: String(fileId), projectId, userId: String(userId) });
      masterVideoUrl = `${playbackBase}/v1/media/telegram/${encodeURIComponent(String(fileId))}?token=${encodeURIComponent(token)}`;
    } catch (_error) {
      masterVideoUrl = null;
    }
  }
  return {
    ...row,
    master_video_url: masterVideoUrl,
    thumbnail_url: media.thumbnail_url || null,
  };
}
export async function listEpisodes(projectId: string, pagination: CursorPaginationInput, seasonNo = 1, userId = ''): Promise<CursorPage<any>> {
  const limit = clampLimit(pagination.limit);
  let query = animeSupabase.from('episodes').select('id, project_id, season_no, episode_no, title, current_state, qc_status, synopsis, scene_count, target_duration_sec, output_media, telegram_file_id, created_at, updated_at').eq('project_id', projectId).eq('season_no', seasonNo).order('episode_no', { ascending: true }).limit(limit + 1);
  if (pagination.cursor) { const cursorEpNo = Number(pagination.cursor); if (Number.isNaN(cursorEpNo) === false) query = query.gt('episode_no', cursorEpNo); }
  const { data, error } = await query;
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'List failed', cause: error });
  const rows = (data ?? []).map((row: any) => withPlayback(row, projectId, userId)); const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore && items.length > 0 ? String(items[items.length - 1].episode_no) : null };
}
export async function getEpisode(projectId: string, episodeNo: number, seasonNo = 1, userId = ''): Promise<any> {
  const { data, error } = await animeSupabase.from('episodes').select('id, project_id, season_no, episode_no, title, current_state, qc_status, synopsis, scene_count, target_duration_sec, output_media, telegram_file_id, created_at, updated_at').eq('project_id', projectId).eq('season_no', seasonNo).eq('episode_no', episodeNo).maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Fetch failed', cause: error });
  if (data === null) throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, httpStatus: 404, message: `Episode S${seasonNo}E${episodeNo} not found.` });
  return withPlayback(data, projectId, userId);
}
export async function getEpisodePlan(projectId: string, episodeNo: number, seasonNo = 1, userId = ''): Promise<any> {
  const episode = await getEpisode(projectId, episodeNo, seasonNo, userId);
  const [stateRes, scenesRes] = await Promise.all([
    animeSupabase.from('episode_states').select('*').eq('project_id', projectId).eq('season_no', seasonNo).eq('episode_no', episodeNo).maybeSingle(),
    animeSupabase.from('scenes').select('id, project_id, season_no, episode_no, scene_order, description, visual_prompt, status, created_at').eq('project_id', projectId).eq('season_no', seasonNo).eq('episode_no', episodeNo).order('scene_order', { ascending: true }),
  ]);
  const scenes = (scenesRes.data ?? []).map((s: any) => ({ ...s, scene_no: s.scene_order, clips: [] }));
  return { project_id: projectId, episode, state_detail: stateRes.data ?? null, scenes_count: scenes.length, scenes };
}
