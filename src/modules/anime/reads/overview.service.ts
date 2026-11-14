import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

type QueryResult<T> = { data: T[] | null; error: any };

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

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
    animeSupabase
      .from('episodes')
      .select('id, season_no, episode_no, title, current_state, qc_status, updated_at')
      .eq('project_id', projectId),
    animeSupabase.from('characters').select('id').eq('project_id', projectId),
    animeSupabase.from('scenes').select('id').eq('project_id', projectId),
    animeSupabase
      .from('api_commands')
      .select('id, intent, status, created_at')
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

  // Each aggregate is tracked independently. A failed query must never be
  // reported to the client as a fabricated zero.
  const errors: Record<string, string> = {};
  const rows = <T>(result: QueryResult<T>, key: string): T[] | null => {
    if (result.error) {
      errors[key] = String(result.error.message || 'Query unavailable');
      return null;
    }
    return result.data ?? [];
  };

  const project = projectRes.data;
  const bible = (project.story_bible && typeof project.story_bible === 'object') ? project.story_bible : {};
  const episodes = rows<any>(episodesRes as unknown as QueryResult<any>, 'episodes');
  const characters = rows<any>(charactersRes as unknown as QueryResult<any>, 'characters');
  const scenes = rows<any>(scenesRes as unknown as QueryResult<any>, 'scenes');
  const jobs = rows<any>(jobsRes as unknown as QueryResult<any>, 'jobs') ?? [];
  const approvals = rows<any>(approvalsRes as unknown as QueryResult<any>, 'approvals');
  const pendingActions = rows<any>(pendingActionsRes as unknown as QueryResult<any>, 'pending_actions');
  const canonRows = rows<any>(canonRes as unknown as QueryResult<any>, 'canon');
  const continuityRows = rows<any>(continuityRes as unknown as QueryResult<any>, 'continuity');

  const series = {
    total_seasons: boundedInt(bible.total_seasons, 1, 1, 100),
    episodes_per_season: boundedInt(bible.episodes_per_season, boundedInt(bible.target_episode_count, 12, 1, 500), 1, 500),
    episode_duration_min: boundedInt(bible.episode_duration_min, 24, 1, 120),
  };

  const activeStatuses = new Set(['QUEUED', 'DISPATCHED', 'ACKNOWLEDGED', 'RUNNING', 'RECONCILING']);
  const activeJobs = jobs.filter((j: any) => activeStatuses.has(String(j.status || '').toUpperCase()));

  let canonStatus: 'UNSET' | 'DRAFT' | 'LOCKED' | null = null;
  if (canonRows !== null) {
    canonStatus = 'UNSET';
    if (canonRows.length > 0) {
      const hasLocked = canonRows.some(
        (r: any) => String(r.canon_status || '').toUpperCase() === 'LOCKED'
      );
      canonStatus = hasLocked ? 'LOCKED' : 'DRAFT';
    }
  }

  let continuityStatus: 'UNCHECKED' | 'PASSED' | 'ISSUES_FOUND' | null = null;
  let continuitySeverity: 'NONE' | 'WARNING' | 'ERROR' | 'CRITICAL' | null = null;
  if (continuityRows !== null) {
    continuityStatus = 'UNCHECKED';
    continuitySeverity = 'NONE';
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
  }

  const publishedCount = episodes === null
    ? null
    : episodes.filter((e: any) => String(e.current_state || '').toUpperCase() === 'PUBLISHED').length;

  const sortedEpisodes = (episodes ?? []).slice().sort((a: any, b: any) => {
    const seasonDiff = Number(a.season_no ?? 1) - Number(b.season_no ?? 1);
    if (seasonDiff !== 0) return seasonDiff;
    return Number(a.episode_no ?? 0) - Number(b.episode_no ?? 0);
  });
  const latestEpisode = sortedEpisodes.length > 0 ? sortedEpisodes[sortedEpisodes.length - 1] : null;

  let nextEpisode: { season_no: number; episode_no: number } | null = null;
  if (episodes !== null) {
    if (!latestEpisode) {
      nextEpisode = { season_no: 1, episode_no: 1 };
    } else {
      const latestSeason = Number(latestEpisode.season_no ?? 1);
      const latestEpisodeNo = Number(latestEpisode.episode_no ?? 0);
      const episodesInLatestSeason = sortedEpisodes.filter(
        (e: any) => Number(e.season_no ?? 1) === latestSeason
      ).length;
      let nextSeason = latestSeason;
      if (
        series.total_seasons > 1 &&
        series.episodes_per_season > 0 &&
        episodesInLatestSeason >= series.episodes_per_season &&
        latestSeason < series.total_seasons
      ) {
        nextSeason = latestSeason + 1;
      }
      nextEpisode = { season_no: nextSeason, episode_no: latestEpisodeNo + 1 };
    }
  }

  const counts = {
    episodes_count: episodes === null ? null : episodes.length,
    episodes_published_count: publishedCount,
    characters_count: characters === null ? null : characters.length,
    scenes_count: scenes === null ? null : scenes.length,
    active_jobs_count: jobsRes.error ? null : activeJobs.length,
    pending_approvals_count: approvals === null ? null : approvals.length,
    pending_actions_count: pendingActions === null ? null : pendingActions.length,
    canon_facts_count: canonRows === null ? null : canonRows.length,
  };

  const status = {
    canon_status: canonStatus,
    continuity_status: continuityStatus,
    continuity_severity: continuitySeverity,
    production_state: activeJobs.length > 0 ? String(activeJobs[0].status) : 'IDLE',
    active_command_id: activeJobs.length > 0 ? activeJobs[0].id : null,
  };

  return {
    project: {
      ...project,
      visual_medium: project.visual_medium ?? bible.visual_medium ?? 'ANIME',
      genre: project.genre ?? bible.genre ?? 'Action / Fantasy',
      auto_approve: Boolean(bible.auto_approve ?? false),
      cover_image_url: bible.cover_image_url ?? null,
      budget_ceiling: Number(bible.budget_ceiling ?? project.budget_ceiling ?? 1000),
    },
    series,
    counts,
    status,
    errors,
    latest_episode: latestEpisode,
    next_episode: nextEpisode,
    recent_episodes: sortedEpisodes.slice(-5).reverse(),
    episodes_count: counts.episodes_count,
    characters_count: counts.characters_count,
    scenes_count: counts.scenes_count,
    active_jobs_count: counts.active_jobs_count,
    pending_approvals_count: counts.pending_approvals_count,
    pending_actions_count: counts.pending_actions_count,
    canon_status: canonStatus,
    continuity_status: continuityStatus,
    continuity_severity: continuitySeverity,
    visual_medium: project.visual_medium ?? bible.visual_medium ?? 'ANIME',
    genre: project.genre ?? bible.genre ?? 'Action / Fantasy',
    auto_approve: Boolean(bible.auto_approve ?? false),
    cover_image_url: bible.cover_image_url ?? null,
    budget_ceiling: Number(bible.budget_ceiling ?? project.budget_ceiling ?? 1000),
  };
}
