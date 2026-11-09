import { randomUUID } from 'crypto';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export async function listProjects(userId: string) {
  if (!userId) return [];

  const { data: ownedProjects, error } = await animeSupabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to list projects.', cause: error });
  }

  return ownedProjects ?? [];
}

export async function createProjectSynchronous(params: {
  userId: string;
  name: string;
  genre?: string;
  visualMedium?: string;
  logline?: string;
}) {
  const projectId = randomUUID();
  const cleanName = (params.name || '').trim() || 'New Anime Project';
  const genre = params.genre || 'Dark Fantasy';
  const visualMedium = params.visualMedium || 'ANIME';

  const initialBible = {
    title: cleanName,
    genre,
    visual_medium: visualMedium,
    world_overview: params.logline || `Core universe premise for ${cleanName} (${genre}).`,
    magic_system: '',
    tone: genre,
    auto_approve: false,
    budget_ceiling: 1000,
  };

  const insertPayload: Record<string, any> = {
    id: projectId,
    user_id: params.userId,
    name: cleanName,
    is_active: true,
    current_season: 1,
    current_episode: 1,
    genre,
    visual_medium: visualMedium,
    description: params.logline || null,
    story_bible: initialBible,
  };

  const { data: createdProject, error } = await animeSupabase
    .from('projects')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: `Failed to create project in DB: ${error.message}`, cause: error });
  }

  return createdProject;
}

export async function getProject(projectId: string, userId: string) {
  if (!userId) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Project access denied.' });
  const { data, error } = await animeSupabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Fetch failed', cause: error });
  if (!data) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Project not found or access denied.' });
  return data;
}
export { getProjectOverview } from './overview.service';
