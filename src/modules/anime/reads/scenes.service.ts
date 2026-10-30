import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { clampLimit, type CursorPage, type CursorPaginationInput } from './reads.types';
export async function listScenes(projectId: string, episodeNo: number, pagination: CursorPaginationInput): Promise<CursorPage<any>> {
  const limit = clampLimit(pagination.limit);
  let scenesQuery = animeSupabase.from('scenes').select('id, project_id, episode_no, scene_order, description, visual_prompt, status, created_at').eq('project_id', projectId).eq('episode_no', episodeNo).order('scene_order', { ascending: true }).limit(limit + 1);
  if (pagination.cursor) { const c = Number(pagination.cursor); if (Number.isNaN(c) === false) scenesQuery = scenesQuery.gt('scene_order', c); }
  const [scenesRes, clipsRes] = await Promise.all([ scenesQuery, animeSupabase.from('clips').select('id, project_id, episode_no, scene_order, clip_url, status, provider, duration_sec, created_at').eq('project_id', projectId).eq('episode_no', episodeNo).order('scene_order', { ascending: true }) ]);
  if (scenesRes.error !== null || clipsRes.error !== null) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Query failed', cause: scenesRes.error || clipsRes.error });
  const raw = scenesRes.data ?? []; const hasMore = raw.length > limit; const sliced = hasMore ? raw.slice(0, limit) : raw;
  const clipsBy = new Map(); for (const c of (clipsRes.data ?? [])) { if (typeof c.scene_order === 'number') { const arr = clipsBy.get(c.scene_order) || []; arr.push(c); clipsBy.set(c.scene_order, arr); } }
  const items = sliced.map((s: any) => ({ ...s, clips: clipsBy.get(s.scene_order) || [] }));
  return { items, next_cursor: hasMore && items.length > 0 ? String(items[items.length - 1].scene_order) : null };
}
