import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export async function getProjectOverview(projectId: string) {
  const [
    projectRes,
    episodesRes,
    charactersRes,
    scenesRes,
    jobsRes,
    approvalsRes,
    pendingActionsRes,
    canonRes,
    continuityRes,
  ] = await Promise.all([
    animeSupabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
    animeSupabase.from('episodes').select('id, episode_no, current_state, qc_status, updated_at').eq('project_id', projectId),
    animeSupabase.from('characters').select('id').eq('project_id', projectId),
    animeSupabase.from('scenes').select('id').eq('project_id', projectId),
    animeSupabase
      .from('api_commands')
      .select('id, intent, status, created_at, updated_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(25),
    animeSupabase
      .from('approval_decisions')
      .select('id, type, status')
      .eq('project_id', projectId)
      .in('status', ['PENDING', 'pending']),
    animeSupabase
      .from('pending_actions')
      .select('id, action_type, status')
      .eq('project_id', projectId)
      .in('status', ['pending', 'queued', 'retry_scheduled', 'PENDING', 'QUEUED', 'RETRY_SCHEDULED']),
    animeSupabase
      .from('canon_facts')
      .select('id, canon_status')
      .eq('project_id', projectId),
    animeSupabase
      .from('continuity_checks')
      .select('id, status, warnings, errors, check_data, checked_at')
      .eq('project_id', projectId)
      .order('checked_at', { ascending: false })
      .limit(10),
  ]);

  if (projectRes.error) {
    throw new AnimeError({
      code: AnimeErrorCode.INTERNAL,
      message: 'Failed to load project overview',
      cause: projectRes.error,
    });
  }
  if (!projectRes.data) {
    throw new AnimeError({
      code: AnimeErrorCode.NOT_FOUND,
      message: 'Project not found',
    });
  }

  const project = projectRes.data;
  const bible = (project.story_bible && typeof project.story_bible === 'object') ? project.story_bible : {};
  const episodes = episodesRes.data ?? [];
  const jobs = jobsRes.data ?? [];

  const activeStatuses = new Set(['QUEUED', 'DISPATCHED', 'ACKNOWLEDGED', 'RUNNING', 'RECONCILING']);
  const activeJobs = jobs.filter((j: any) => activeStatuses.has(String(j.status || '').toUpperCase()));

  const canonRows = canonRes.data ?? [];
  let canonStatus: 'UNSET' | 'DRAFT' | 'LOCKED' = 'UNSET';
  if (canonRows.length > 0) {
    const hasLocked = canonRows.some(
      (r: any) => String(r.canon_status || '').toUpperCase() === 'LOCKED'
    );
    canonStatus = hasLocked ? 'LOCKED' : 'DRAFT';
  }

  const continuityRows = continuityRes.data ?? [];
  let continuityStatus: 'UNCHECKED' | 'PASSED' | 'ISSUES_FOUND' = 'UNCHECKED';
  let continuitySeverity: 'NONE' | 'WARNING' | 'ERROR' | 'CRITICAL' = 'NONE';
  if (continuityRows.length > 0) {
    const latestCheck = continuityRows[0];
    const rawStatus = String(latestCheck.status || '').toUpperCase();
    const errList = Array.isArray(latestCheck.errors) ? latestCheck.errors : [];
    const warnList = Array.isArray(latestCheck.warnings) ? latestCheck.warnings : [];

    if (rawStatus === 'FAILED' || rawStatus === 'ERROR' || rawStatus === 'ISSUES_FOUND' || errList.length > 0) {
      continuityStatus = 'ISSUES_FOUND';
      continuitySeverity = errList.length > 2 ? 'CRITICAL' : 'ERROR';
    } else if (rawStatus === 'WARNING' || warnList.length > 0) {
      continuityStatus = 'ISSUES_FOUND';
      continuitySeverity = 'WARNING';
    } else if (rawStatus === 'PASSED' || rawStatus === 'OK' || rawStatus === 'SUCCEEDED') {
      continuityStatus = 'PASSED';
      continuitySeverity = 'NONE';
    }
  }

  const pendingApprovalsCount = (approvalsRes.data ?? []).length;
  const pendingActionsCount = (pendingActionsRes.data ?? []).length;
  const publishedCount = episodes.filter(
    (e: any) => String(e.current_state || '').toUpperCase() === 'PUBLISHED'
  ).length;

  return {
    project: {
      ...project,
      visual_medium: bible.visual_medium ?? 'ANIME',
      genre: bible.genre ?? 'Action / Fantasy',
      auto_approve: Boolean(bible.auto_approve ?? false),
      cover_image_url: bible.cover_image_url ?? null,
      budget_ceiling: Number(bible.budget_ceiling ?? project.budget_ceiling ?? 1000),
    },
    counts: {
      episodes_count: episodes.length,
      episodes_published_count: publishedCount,
      characters_count: (charactersRes.data ?? []).length,
      scenes_count: (scenesRes.data ?? []).length,
      active_jobs_count: activeJobs.length,
      pending_approvals_count: pendingApprovalsCount,
      pending_actions_count: pendingActionsCount,
      canon_facts_count: canonRows.length,
    },
    status: {
      canon_status: canonStatus,
      continuity_status: continuityStatus,
      continuity_severity: continuitySeverity,
      production_state: activeJobs.length > 0 ? String(activeJobs[0].status) : 'IDLE',
      active_command_id: activeJobs.length > 0 ? activeJobs[0].id : null,
    },
    episodes_count: episodes.length,
    characters_count: (charactersRes.data ?? []).length,
    scenes_count: (scenesRes.data ?? []).length,
    active_jobs_count: activeJobs.length,
    pending_approvals_count: pendingApprovalsCount,
    pending_actions_count: pendingActionsCount,
    canon_status: canonStatus,
    continuity_status: continuityStatus,
    continuity_severity: continuitySeverity,
    visual_medium: bible.visual_medium ?? 'ANIME',
    genre: bible.genre ?? 'Action / Fantasy',
    auto_approve: Boolean(bible.auto_approve ?? false),
    cover_image_url: bible.cover_image_url ?? null,
    budget_ceiling: Number(bible.budget_ceiling ?? project.budget_ceiling ?? 1000),
  };
}
