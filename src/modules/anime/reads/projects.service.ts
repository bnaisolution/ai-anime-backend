import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { clampLimit, type CursorPage, type CursorPaginationInput } from './reads.types';
export async function listProjects(userId: string, pagination: CursorPaginationInput): Promise<CursorPage<any>> {
  const limit = clampLimit(pagination.limit);
  let query = animeSupabase.from('projects').select('id, user_id, name, is_active, story_bible, current_season, current_episode, created_at, updated_at').eq('user_id', userId).order('id', { ascending: true }).limit(limit + 1);
  if (pagination.cursor) query = query.gt('id', pagination.cursor);
  const { data, error } = await query;
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'List failed', cause: error });
  const rows = data ?? []; const hasMore = rows.length > limit; const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore ? items[items.length - 1]?.id ?? null : null };
}
export async function getProject(projectId: string, userId: string): Promise<any> {
  const { data, error } = await animeSupabase.from('projects').select('id, user_id, name, is_active, story_bible, current_season, current_episode, created_at, updated_at').eq('id', projectId).eq('user_id', userId).maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Fetch failed', cause: error });
  if (data === null) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Access denied.' });
  return data;
}
export async function getProjectOverview(projectId: string, userId: string): Promise<any> {
  const project = await getProject(projectId, userId);
  const [episodesRes, scenesRes, pendingRes, activeJobsRes] = await Promise.all([
    animeSupabase.from('episodes').select('episode_no', { count: 'exact', head: true }).eq('project_id', projectId),
    animeSupabase.from('scenes').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    animeSupabase.from('pending_actions').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    animeSupabase.from('api_commands').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('status', ['QUEUED', 'DISPATCHED', 'ACKNOWLEDGED', 'RECONCILING']),
  ]);
  return { project, stats: { total_episodes: episodesRes.count ?? 0, total_scenes: scenesRes.count ?? 0, pending_actions_count: pendingRes.count ?? 0, active_jobs_count: activeJobsRes.count ?? 0 } };
}
