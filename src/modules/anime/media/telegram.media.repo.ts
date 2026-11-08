import { animeSupabase } from '../db/anime.supabase';
import { TelegramProxyError } from './telegram.security';

const CLIP_FILE_COLUMNS = [
  'tg_image_file_id',
  'tg_audio_file_id',
  'tg_video_file_id',
  'image_file_id',
  'output_file_id'
];

interface EpisodeAccessRow {
  project_id?: string | null;
  current_state?: string | null;
  published_at?: string | null;
}

export interface TelegramFileAccess {
  projectIds: string[];
  published: boolean;
}

function lookupFailed(): TelegramProxyError {
  return new TelegramProxyError(503, 'MEDIA_LOOKUP_FAILED', 'Media authorization lookup failed');
}

function projectId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function resolveTelegramFileAccess(fileId: string, includePrivateClips: boolean): Promise<TelegramFileAccess> {
  const episodeResults = await Promise.all([
    animeSupabase
      .from('episodes')
      .select('project_id,current_state,published_at')
      .eq('telegram_file_id', fileId),
    animeSupabase
      .from('episodes')
      .select('project_id,current_state,published_at')
      .eq('output_media->>telegram_file_id', fileId)
  ]);

  if (episodeResults.some((result) => result.error)) throw lookupFailed();

  const episodes = episodeResults.flatMap((result) => (result.data ?? []) as EpisodeAccessRow[]);
  const projectIds = new Set<string>();
  let published = false;

  for (const episode of episodes) {
    const id = projectId(episode.project_id);
    if (id) projectIds.add(id);
    const state = String(episode.current_state || '').toUpperCase();
    if (episode.published_at || state === 'PUBLISHED') published = true;
  }

  if (projectIds.size > 0 || !includePrivateClips) {
    return { projectIds: Array.from(projectIds), published };
  }

  const clipResults = await Promise.all(
    CLIP_FILE_COLUMNS.map((column) =>
      animeSupabase.from('clips').select('project_id').eq(column, fileId)
    )
  );
  if (clipResults.some((result) => result.error)) throw lookupFailed();

  for (const result of clipResults) {
    for (const row of (result.data ?? []) as Array<{ project_id?: string | null }>) {
      const id = projectId(row.project_id);
      if (id) projectIds.add(id);
    }
  }

  return { projectIds: Array.from(projectIds), published };
}

export async function userOwnsAnyProject(userId: string, projectIds: string[]): Promise<boolean> {
  if (projectIds.length === 0) return false;
  const { data, error } = await animeSupabase
    .from('projects')
    .select('id,user_id')
    .in('id', projectIds);
  if (error) throw lookupFailed();
  return (data ?? []).some((row: { user_id?: string | null }) => row.user_id === userId);
}
