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

  const projects = ownedProjects ?? [];
  if (projects.length === 0) return [];

  // Derive honest project-level production labels from real job rows instead of
  // mapping every non-active project to a misleading IDLE badge.
  const activeStatuses = new Set(['QUEUED', 'DISPATCHED', 'ACKNOWLEDGED', 'RUNNING', 'RECONCILING']);
  let jobs: any[] | null = [];
  try {
    const { data: jobRows, error: jobError } = await animeSupabase
      .from('api_commands')
      .select('project_id, status, created_at')
      .in('project_id', projects.map((project: any) => project.id))
      .order('created_at', { ascending: false })
      .limit(2000);
    if (jobError) jobs = null;
    else jobs = jobRows ?? [];
  } catch (_) {
    jobs = null;
  }

  const jobsByProject = new Map<string, any[]>();
  for (const job of jobs ?? []) {
    const key = String(job.project_id || '');
    if (!key) continue;
    const list = jobsByProject.get(key) ?? [];
    list.push(job);
    jobsByProject.set(key, list);
  }

  return projects.map((project: any) => {
    const projectJobs = jobsByProject.get(String(project.id)) ?? [];
    const activeJobs = projectJobs.filter((job: any) =>
      activeStatuses.has(String(job.status || '').toUpperCase())
    );
    const latestJob = projectJobs[0] ?? null;
    let productionStatus: string | null = null;
    if (jobs !== null) {
      if (activeJobs.length > 0) {
        productionStatus = String(activeJobs[0].status || 'RUNNING').toUpperCase();
      } else if (latestJob) {
        const raw = String(latestJob.status || '').toUpperCase();
        if (raw === 'SUCCEEDED' || raw === 'COMPLETED') productionStatus = 'COMPLETED';
        else if (raw === 'FAILED' || raw === 'ERROR') productionStatus = 'FAILED';
        else if (raw === 'CANCELLED') productionStatus = 'CANCELLED';
        else productionStatus = raw || null;
      } else {
        productionStatus = Number(project.current_episode ?? 0) > 0 ? 'IN PROGRESS' : 'NOT STARTED';
      }
    }
    return {
      ...project,
      production_status: productionStatus,
      active_jobs_count: jobs === null ? null : activeJobs.length,
      latest_job_status: latestJob ? String(latestJob.status || '') : null,
      latest_job_at: latestJob ? latestJob.created_at : null,
    };
  });
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
