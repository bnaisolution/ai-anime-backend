import type { FastifyInstance } from 'fastify';
import type { AuthContext } from '../../../plugins/auth';
import { animeSupabase } from '../../anime/db/anime.supabase';

export type TimelineStageStatus = 'done' | 'active' | 'pending' | 'failed' | 'skipped';

export interface TimelineStage {
  key: 'PLAN' | 'SCRIPT' | 'RENDER' | 'QC' | 'PUBLISH';
  label: string;
  status: TimelineStageStatus;
}

export interface DirectorTimeline {
  command_id: string | null;
  intent: string | null;
  command_status: string | null;
  stage_index: number;
  stages: TimelineStage[];
  episode: {
    season_no: number;
    episode_no: number;
    state: string;
    qc_status: string;
    approval_status: string;
    scene_count: number;
    clip_count: number;
  } | null;
  updated_at: string;
}

const STAGE_LABELS: Array<{ key: TimelineStage['key']; label: string }> = [
  { key: 'PLAN', label: 'Plan' },
  { key: 'SCRIPT', label: 'Script' },
  { key: 'RENDER', label: 'Render' },
  { key: 'QC', label: 'QC' },
  { key: 'PUBLISH', label: 'Publish' },
];

const STATUS_STAGE: Record<string, number> = {
  QUEUED: 0,
  ACCEPTED: 0,
  PERSISTED: 0,
  DISPATCH_PENDING: 1,
  DISPATCHED: 1,
  ACKNOWLEDGED: 2,
  RECONCILING: 2,
  SUCCEEDED: 4,
  FAILED: -1,
  DEFERRED: -1,
  MANUAL_REVIEW: -1,
};

const PRODUCTION_INTENTS = new Set([
  'GENERATE_EPISODE', 'CONTINUE_EPISODE', 'REGENERATE_EPISODE',
  'QUICK_GENERATE_REEL', 'QUICK_GENERATE_IMAGE', 'QUICK_GENERATE_VIDEO',
]);

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildStages(params: {
  status: string;
  stageIndex: number;
  intent: string;
  episodeQc: string;
  episodeApproval: string;
}): TimelineStage[] {
  const { status, stageIndex, intent, episodeQc, episodeApproval } = params;
  const failed = status === 'FAILED' || status === 'MANUAL_REVIEW' || status === 'DEFERRED';
  const suiteDone = status === 'SUCCEEDED';

  return STAGE_LABELS.map((stage, index): TimelineStage => {
    if (suiteDone) {
      if (stage.key === 'PUBLISH') {
        const published = episodeApproval.toUpperCase() === 'APPROVED' && episodeQc.toUpperCase() === 'PASSED';
        return { ...stage, status: published ? 'done' : 'pending' };
      }
      if (stage.key === 'QC') {
        return { ...stage, status: episodeQc.toUpperCase() === 'PENDING' ? 'active' : 'done' };
      }
      return { ...stage, status: 'done' };
    }
    if (failed) {
      if (index < Math.max(0, stageIndex)) return { ...stage, status: 'done' };
      if (index === Math.max(0, stageIndex)) return { ...stage, status: 'failed' };
      return { ...stage, status: 'pending' };
    }
    if (index < stageIndex) return { ...stage, status: 'done' };
    if (index === stageIndex) return { ...stage, status: 'active' };
    return { ...stage, status: 'pending' };
  }).map((stage): TimelineStage => (
    stage.key === 'PUBLISH' && !PRODUCTION_INTENTS.has(intent) && suiteDone
      ? { ...stage, status: 'skipped' }
      : stage
  ));
}

export async function buildDirectorTimeline(
  fastify: FastifyInstance,
  auth: AuthContext,
  input: { projectId: string; commandId?: string | null; seasonNo?: number | null; episodeNo?: number | null }
): Promise<DirectorTimeline> {
  let command: Record<string, unknown> | null = null;
  if (input.commandId) {
    try {
      const { data } = await animeSupabase
        .from('api_commands')
        .select('id, intent, status, updated_at, payload')
        .eq('id', input.commandId)
        .eq('user_id', auth.userId)
        .maybeSingle();
      command = (data as Record<string, unknown> | null) ?? null;
    } catch (error) {
      fastify.log.debug({ err: error }, 'Director timeline: command lookup failed');
    }
  }

  const intent = asString(command?.intent);
  const status = asString(command?.status) || 'QUEUED';
  const payload = (command?.payload && typeof command.payload === 'object')
    ? command.payload as Record<string, unknown>
    : {};
  const seasonNo = input.seasonNo ?? asNumber(payload.season_no) ?? 1;
  const episodeNo = input.episodeNo ?? asNumber(payload.episode_no) ?? 1;

  let episode: DirectorTimeline['episode'] = null;
  try {
    const { data } = await animeSupabase
      .from('episodes')
      .select('season_no, episode_no, current_state, qc_status, approval_status, scene_count')
      .eq('project_id', input.projectId)
      .eq('season_no', seasonNo || 1)
      .eq('episode_no', episodeNo || 1)
      .maybeSingle();
    if (data) {
      const row = data as Record<string, unknown>;
      let clipCount = 0;
      try {
        const clips = await animeSupabase
          .from('clips')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', input.projectId)
          .eq('season_no', seasonNo || 1)
          .eq('episode_no', episodeNo || 1);
        clipCount = clips.count || 0;
      } catch {
        clipCount = 0;
      }
      episode = {
        season_no: asNumber(row.season_no) || 1,
        episode_no: asNumber(row.episode_no) || 1,
        state: asString(row.current_state) || 'UNKNOWN',
        qc_status: asString(row.qc_status) || 'PENDING',
        approval_status: asString(row.approval_status) || 'PENDING',
        scene_count: asNumber(row.scene_count),
        clip_count: clipCount,
      };
    }
  } catch (error) {
    fastify.log.debug({ err: error }, 'Director timeline: episode lookup failed');
  }

  const stageIndex = STATUS_STAGE[status] ?? 0;
  const stages = buildStages({
    status,
    stageIndex,
    intent,
    episodeQc: episode?.qc_status || 'PENDING',
    episodeApproval: episode?.approval_status || 'PENDING',
  });

  return {
    command_id: input.commandId ?? null,
    intent: intent || null,
    command_status: command ? status : null,
    stage_index: stageIndex < 0 ? 0 : stageIndex,
    stages,
    episode,
    updated_at: new Date().toISOString(),
  };
}
