import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export async function cleanupStaleProjectTasks(projectId?: string) {
  const nowIso = new Date().toISOString();
  try {
    let paQuery = animeSupabase
      .from('pending_actions')
      .update({ status: 'EXPIRED' })
      .in('status', ['PENDING', 'RUNNING', 'FAILED', 'RETRY_SCHEDULED', 'pending', 'running', 'failed', 'retry_scheduled'])
      .lt('expires_at', nowIso);
    if (projectId) paQuery = paQuery.eq('project_id', projectId);
    await paQuery;

    const approvalCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    let aprQuery = animeSupabase
      .from('approval_decisions')
      .update({ status: 'EXPIRED', decision: 'EXPIRED' })
      .eq('status', 'PENDING')
      .lt('created_at', approvalCutoff);
    if (projectId) aprQuery = aprQuery.eq('project_id', projectId);
    await aprQuery;
  } catch (_e) {}
}

export async function listJobs(projectId: string) {
  await cleanupStaleProjectTasks(projectId);
  const { data: commands, error } = await animeSupabase
    .from('api_commands')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(25);
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch jobs.', cause: error });
  return commands ?? [];
}

export async function getJobDetail(projectId: string, jobId: string) {
  const { data: command, error } = await animeSupabase
    .from('api_commands')
    .select('*')
    .eq('project_id', projectId)
    .eq('id', jobId)
    .maybeSingle();
  if (error || !command) throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Job not found.', cause: error });

  const episodeNo = command.payload?.episode_no ?? command.payload?.episode_number ?? null;

  const [epRes, paRes] = await Promise.all([
    episodeNo ? animeSupabase.from('episodes').select('*').eq('project_id', projectId).eq('episode_no', episodeNo).maybeSingle() : Promise.resolve({ data: null }),
    animeSupabase.from('pending_actions').select('*').eq('project_id', projectId).in('status', ['PENDING', 'RUNNING', 'RETRY_SCHEDULED', 'pending', 'running', 'retry_scheduled']),
  ]);

  return { ...command, episode_state: epRes.data ?? null, pending_actions: paRes.data ?? [] };
}

export async function getJob(projectId: string, jobId: string) {
  return getJobDetail(projectId, jobId);
}
