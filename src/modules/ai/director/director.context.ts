import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { AuthContext } from '../../../plugins/auth';
import { animeSupabase } from '../../anime/db/anime.supabase';
import { list as listInfrastructure } from '../../anime/infrastructure/infrastructure.service';
import { retrieveContext } from '../../anime/intelligence/memory.service';
import { getQuotaStatus } from '../../../security/executionGuard';
import { flags } from '../../../config/flags';
import { buildDirectorReadiness, compactReadiness, evaluateProjectSetup, type DirectorSetupSummary } from './director.readiness';
import {
  actualRuntimeSec,
  classifyDuration,
  deriveProjectDefaultDurationSec,
  resolveTargetSelection,
  type DurationBible,
  type RuntimeClip,
} from './director.duration';
import type { DirectorContext } from './director.types';

export interface BuildDirectorContextInput {
  projectId: string;
  explicitSeasonNo?: number | null;
  explicitEpisodeNo?: number | null;
  explicitTargetDurationSec?: number | null;
  currentScreen?: string | null;
  memoryQuery?: string | null;
  projectRole?: string | null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readPersistedTarget(episode: Record<string, unknown> | null): number | null {
  if (!episode) return null;
  const direct = Number(episode.target_duration_sec);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const script = asObject(episode.script_json);
  const scriptTarget = Number(script.target_duration_sec);
  if (Number.isFinite(scriptTarget) && scriptTarget > 0) return scriptTarget;
  return null;
}

function readScriptRuntime(episode: Record<string, unknown> | null): { totalSec: number; counted: number } {
  if (!episode) return { totalSec: 0, counted: 0 };
  const script = asObject(episode.script_json);
  const scenes = Array.isArray(script.scenes) ? script.scenes : [];
  let totalSec = 0;
  let counted = 0;
  for (const scene of scenes) {
    const item = asObject(scene);
    const value = Number(item.duration_sec ?? item.duration);
    if (Number.isFinite(value) && value > 0) {
      totalSec += value;
      counted += 1;
    }
  }
  return { totalSec: Math.round(totalSec), counted };
}

function readCommandTarget(command: Record<string, unknown>): number | null {
  const payload = asObject(command.payload);
  const value = Number(payload.target_duration_sec ?? payload.targetDurationSec);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function readCommandEpisode(command: Record<string, unknown>): { seasonNo: number; episodeNo: number } {
  const payload = asObject(command.payload);
  return {
    seasonNo: Math.max(1, Math.round(Number(payload.season_no ?? payload.seasonNo) || 1)),
    episodeNo: Math.max(1, Math.round(Number(payload.episode_no ?? payload.episodeNo) || 1)),
  };
}

function buildContextVersion(input: {
  project: Record<string, unknown>;
  targetSec: number;
  seasonNo: number;
  episodeNo: number;
  episodeState: string;
  latestCommandId: string | null;
  onboardingStep: string;
}): string {
  const raw = JSON.stringify({
    project_id: input.project.id,
    canon_version: input.project.canon_version,
    continuity_version: input.project.continuity_version,
    updated_at: input.project.updated_at,
    target_sec: input.targetSec,
    season_no: input.seasonNo,
    episode_no: input.episodeNo,
    episode_state: input.episodeState,
    latest_command_id: input.latestCommandId,
    onboarding_step: input.onboardingStep,
  });
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

export async function buildDirectorContext(
  fastify: FastifyInstance,
  auth: AuthContext,
  input: BuildDirectorContextInput
): Promise<DirectorContext> {
  const { data: project, error: projectError } = await animeSupabase
    .from('projects')
    .select('id, user_id, name, story_bible, current_season, current_episode, canon_version, continuity_version, visual_style, genre, language, description, updated_at')
    .eq('id', input.projectId)
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (projectError || !project) {
    const err = new Error('PROJECT_NOT_FOUND');
    (err as any).code = 'PROJECT_NOT_FOUND';
    throw err;
  }

  const bible = asObject(project.story_bible);
  const episodesQuery = animeSupabase
    .from('episodes')
    .select('episode_no, season_no, current_state, qc_status, approval_status, output_media, script_json, scene_count, summary_200w, target_duration_sec')
    .eq('project_id', input.projectId)
    .order('season_no', { ascending: true })
    .order('episode_no', { ascending: true })
    .limit(40);

  let episodesRes: any = await episodesQuery;
  if (episodesRes.error) {
    episodesRes = await animeSupabase
      .from('episodes')
      .select('episode_no, season_no, current_state, qc_status, approval_status, output_media, script_json, scene_count, summary_200w')
      .eq('project_id', input.projectId)
      .order('season_no', { ascending: true })
      .order('episode_no', { ascending: true })
      .limit(40);
  }
  const episodes = (episodesRes.data || []) as Record<string, unknown>[];

  const recentCommandsRes = await animeSupabase
    .from('api_commands')
    .select('id, intent, payload, status, created_at')
    .eq('project_id', input.projectId)
    .order('created_at', { ascending: false })
    .limit(12);
  const recentCommands = (recentCommandsRes.data || []) as Record<string, unknown>[];

  const explicitSeason = Math.max(1, Math.round(Number(input.explicitSeasonNo) || Number(project.current_season) || 1));
  const defaultEpisode = Math.max(1, Number(project.current_episode) || Number(episodes[0]?.episode_no) || 1);
  const explicitEpisode = input.explicitEpisodeNo != null
    ? Math.max(1, Math.round(Number(input.explicitEpisodeNo)))
    : defaultEpisode;
  const targetSeason = explicitSeason;

  let targetEpisodeRow = episodes.find((e) =>
    Number(e.season_no) === targetSeason && Number(e.episode_no) === explicitEpisode
  ) || null;
  if (!targetEpisodeRow) {
    const targetQuery = await animeSupabase
      .from('episodes')
      .select('episode_no, season_no, current_state, qc_status, approval_status, output_media, script_json, scene_count, summary_200w, target_duration_sec')
      .eq('project_id', input.projectId)
      .eq('season_no', targetSeason)
      .eq('episode_no', explicitEpisode)
      .maybeSingle();
    if (targetQuery.data) targetEpisodeRow = targetQuery.data as Record<string, unknown>;
    else if (targetQuery.error) {
      const fallbackQuery = await animeSupabase
        .from('episodes')
        .select('episode_no, season_no, current_state, qc_status, approval_status, output_media, script_json, scene_count, summary_200w')
        .eq('project_id', input.projectId)
        .eq('season_no', targetSeason)
        .eq('episode_no', explicitEpisode)
        .maybeSingle();
      if (fallbackQuery.data) targetEpisodeRow = fallbackQuery.data as Record<string, unknown>;
    }
  }

  const executingCommand = recentCommands.find((command) => {
    const status = String(command.status || '').toUpperCase();
    if (['SUCCEEDED', 'FAILED', 'CANCELLED', 'DEAD_LETTER', 'MANUAL_REVIEW'].includes(status)) return false;
    const target = readCommandEpisode(command);
    return target.seasonNo === targetSeason && target.episodeNo === explicitEpisode;
  }) || null;

  const projectDefaultSec = deriveProjectDefaultDurationSec(bible as DurationBible);
  const target = resolveTargetSelection({
    seasonNo: targetSeason,
    episodeNo: explicitEpisode,
    projectDefaultSec,
    explicitSec: input.explicitTargetDurationSec,
    persistedSec: readPersistedTarget(targetEpisodeRow),
    executingSec: executingCommand ? readCommandTarget(executingCommand) : null,
  }, bible as DurationBible);

  if (target.conflict) {
    const err = new Error(target.conflictReason || 'TARGET_CONFLICT');
    (err as any).code = 'TARGET_CONFLICT';
    throw err;
  }

  let clipsRes = await animeSupabase
    .from('clips')
    .select('*')
    .eq('project_id', input.projectId)
    .eq('season_no', targetSeason)
    .eq('episode_no', explicitEpisode)
    .limit(500);
  if (clipsRes.error) clipsRes = { data: [], error: null } as any;
  const clips = (clipsRes.data || []) as RuntimeClip[];
  const clipRuntime = actualRuntimeSec(clips);
  const scriptRuntime = readScriptRuntime(targetEpisodeRow);
  const runtime = clipRuntime.counted > 0
    ? clipRuntime
    : { totalSec: scriptRuntime.totalSec, counted: scriptRuntime.counted, missing: clipRuntime.missing };
  const duration = classifyDuration(target.targetDurationSec, runtime.totalSec, target.toleranceSec);

  const memoryQuery = String(input.memoryQuery || '').trim();
  const memoryKnowledgePromise = memoryQuery.length >= 3
    ? retrieveContext(input.projectId, memoryQuery, auth.userId).then((data) => ({ data }))
    : animeSupabase
      .from('memory_knowledge')
      .select('memory_type, content, created_at')
      .eq('project_id', input.projectId)
      .order('created_at', { ascending: false })
      .limit(8);

  const [charactersRes, approvalsRes, failedRes, infra, memoryKnowledgeRes, storyMemoryRes] = await Promise.all([
    animeSupabase
      .from('characters')
      .select('name, initial_status, age_group, description')
      .eq('project_id', input.projectId)
      .limit(12),
    animeSupabase
      .from('pending_actions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', input.projectId)
      .eq('status', 'pending'),
    animeSupabase
      .from('failed_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', input.projectId)
      .in('status', ['pending', 'failed']),
    listInfrastructure(auth.userId),
    memoryKnowledgePromise,
    animeSupabase
      .from('story_memory')
      .select('memory_level, memory_key, memory_value, importance, created_at')
      .eq('project_id', input.projectId)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const cast = (charactersRes.data || []).map((c: Record<string, unknown>) => ({
    name: String(c.name || 'Unknown'),
    status: asString(c.initial_status),
    age_group: asString(c.age_group),
  }));

  const activeInfra = infra.filter((item) => item.status === 'active');
  const providerTypes = [...new Set(activeInfra
    .map((item) => item.provider_type)
    .filter((type) => ['groq', 'gemini', 'custom'].includes(type)))];
  const quota = await getQuotaStatus(fastify, auth.userId);

  const readiness = flags.directorReadiness
    ? await buildDirectorReadiness(fastify, auth, input.projectId)
    : null;
  const readinessSummary = readiness ? compactReadiness(readiness) : null;
  const gpuReady = readiness ? readiness.resources.gpu.status !== 'missing' : activeInfra.some(
    (item) => ['own_gpu', 'kaggle'].includes(item.provider_type)
  );
  const resourceSummary: DirectorContext['resources'] = {
    byod_provider_count: activeInfra.length,
    active_provider_types: providerTypes,
    gpu_worker_configured: gpuReady,
    cpu_worker_configured: readiness ? readiness.resources.cpu.status !== 'missing' : false,
    telegram_configured: readiness ? readiness.resources.telegram.status !== 'missing' : false,
    storage_ready: readiness ? readiness.resources.storage.status !== 'missing' : false,
    youtube_connected: readiness ? readiness.resources.youtube.status !== 'missing' : false,
    instagram_connected: readiness ? readiness.resources.instagram.status !== 'missing' : false,
    github_dispatch_configured: readiness ? readiness.resources.github.status !== 'missing' : false,
    readiness: readinessSummary,
  };

  const projectSetup = evaluateProjectSetup(project, {
    castCount: cast.length,
    bibleVersionCount: asString(bible.bible_approved_at) ? 1 : 0,
  });
  const setup: DirectorSetupSummary = readiness?.setup ?? {
    complete: false,
    active_track: null,
    byod: { complete: false, missing: ['database'], configured: {} },
    saas: { enabled: flags.saasBilling, tenant_configured: false, complete: false },
    project: projectSetup,
    next_step: projectSetup?.next_step ?? 'project_create',
    deep_link: projectSetup?.deep_link ?? 'projects',
  };
  const role = String(input.projectRole || (auth.role === 'owner_admin' ? 'owner' : 'viewer')).toLowerCase();
  const access: DirectorContext['access'] = {
    role,
    can_edit: ['editor', 'admin', 'owner'].includes(role),
    can_review: ['reviewer', 'admin', 'owner'].includes(role),
    can_publish: ['editor', 'admin', 'owner'].includes(role),
    can_manage_settings: ['editor', 'admin', 'owner'].includes(role),
  };
  const onboardingPhase = readiness && !setup.complete
    ? 'BYOD_SETUP'
    : projectSetup
      ? (!projectSetup.settings_complete
        ? 'PROJECT_SETTINGS'
        : !projectSetup.bible_draft_ready
          ? 'STORY_BIBLE'
          : !projectSetup.bible_approved
            ? 'BIBLE_APPROVAL'
            : !projectSetup.cast_ready
              ? 'CAST_SETUP'
              : String(targetEpisodeRow?.current_state || 'PRODUCTION_READY'))
      : 'PROJECT_SETUP';

  const context: DirectorContext = {
    context_version: buildContextVersion({
      project,
      targetSec: target.targetDurationSec,
      seasonNo: targetSeason,
      episodeNo: explicitEpisode,
      episodeState: String(targetEpisodeRow?.current_state || 'NOT_STARTED'),
      latestCommandId: recentCommands[0] ? String(recentCommands[0].id) : null,
      onboardingStep: onboardingPhase,
    }),
    setup,
    access,
    project: {
      id: String(project.id),
      name: String(project.name || 'Untitled Project'),
      genre: asString(project.genre) || asString(bible.genre),
      format: asString(bible.format) || asString(bible.project_format) || asString(project.visual_style),
      language: asString(project.language) || 'hi',
      visual_style: asString(project.visual_style),
      phase: onboardingPhase,
      current_season: Number(project.current_season) || 1,
      current_episode: Number(project.current_episode) || 0,
      canon_version: Number(project.canon_version) || 1,
      continuity_version: Number(project.continuity_version) || 1,
    },
    target: {
      ...target,
      actual_runtime_sec: runtime.totalSec,
      runtime_clip_count: runtime.counted,
      runtime_missing_count: runtime.missing,
      duration_status: duration.status,
      duration_delta_sec: duration.deltaSec,
    },
    bible,
    cast,
    episode: targetEpisodeRow ? {
      episode_no: Number(targetEpisodeRow.episode_no) || explicitEpisode,
      season_no: Number(targetEpisodeRow.season_no) || targetSeason,
      state: String(targetEpisodeRow.current_state || 'UNKNOWN'),
      qc_status: String(targetEpisodeRow.qc_status || 'PENDING'),
      approval_status: String(targetEpisodeRow.approval_status || 'PENDING'),
      scene_count: Number(targetEpisodeRow.scene_count) || 0,
      summary: asString(targetEpisodeRow.summary_200w),
    } : null,
    recent_episodes: episodes.slice(-6).map((e) => ({
      episode_no: Number(e.episode_no) || 0,
      season_no: Number(e.season_no) || 1,
      state: String(e.current_state || 'UNKNOWN'),
      qc_status: String(e.qc_status || 'PENDING'),
    })),
    memory: {
      knowledge: (memoryKnowledgeRes.data || []).map((row: Record<string, unknown>) => ({
        memory_type: asString(row.memory_type),
        content: asString(row.content),
      })).filter((row) => Boolean(row.content)),
      story: (storyMemoryRes.data || []).map((row: Record<string, unknown>) => ({
        level: asString(row.memory_level),
        key: asString(row.memory_key),
        importance: asString(row.importance),
        value: row.memory_value ?? null,
      })),
    },
    pending_actions: approvalsRes.count || 0,
    failed_jobs: failedRes.count || 0,
    resources: resourceSummary,
    quota: {
      rpm_used: quota.used.rpm,
      rpm_limit: quota.limits.RPM,
      rpd_used: quota.used.rpd,
      rpd_limit: quota.limits.RPD,
    },
    recent_commands: recentCommands.slice(0, 6).map((command) => ({
      intent: String(command.intent || 'UNKNOWN'),
      status: String(command.status || 'UNKNOWN'),
      created_at: asString(command.created_at),
    })),
    workflow_ids_visible: auth.role === 'owner_admin',
  };

  return context;
}

const PROMPT_CONTEXT_LIMIT = 14_000;

function compactValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.length > 600 ? `${value.slice(0, 597)}...` : value;
  if (depth >= 3) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => compactValue(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      const compacted = compactValue(item, depth + 1);
      if (compacted !== undefined) result[key] = compacted;
    }
    return result;
  }
  return value;
}

function coreBibleSummary(bible: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'genre', 'format', 'project_format', 'language', 'tone', 'visual_style', 'visual_medium',
    'episode_duration_min', 'logline', 'synopsis', 'setting', 'theme', 'audience', 'rating',
  ];
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (bible[key] !== undefined) result[key] = compactValue(bible[key]);
  }
  result.bible_keys = Object.keys(bible).slice(0, 40);
  return result;
}

export function compactDirectorContext(context: DirectorContext): string {
  const promptContext: Record<string, unknown> = {
    project: context.project,
    target: context.target,
    bible: compactValue(context.bible),
    cast: context.cast,
    episode: context.episode,
    recent_episodes: context.recent_episodes,
    memory: context.memory,
    pending_actions: context.pending_actions,
    failed_jobs: context.failed_jobs,
    resources: context.resources,
    quota: context.quota,
  };
  let raw = JSON.stringify(promptContext);
  if (raw.length > PROMPT_CONTEXT_LIMIT) {
    promptContext.bible = coreBibleSummary(context.bible as Record<string, unknown>);
    promptContext.cast = context.cast.slice(0, 6);
    promptContext.recent_episodes = context.recent_episodes.slice(-3);
    promptContext.recent_commands = context.recent_commands.slice(0, 3);
    promptContext.memory = compactValue(context.memory);
    raw = JSON.stringify(promptContext);
  }
  if (raw.length > PROMPT_CONTEXT_LIMIT) {
    promptContext.recent_episodes = [];
    promptContext.recent_commands = [];
    promptContext.episode = context.episode ? compactValue(context.episode) : null;
    raw = JSON.stringify(promptContext);
  }
  if (raw.length > PROMPT_CONTEXT_LIMIT) {
    return JSON.stringify({
      truncated: true,
      project: promptContext.project,
      target: promptContext.target,
      episode: promptContext.episode,
      resources: promptContext.resources,
      quota: promptContext.quota,
    });
  }
  return raw;
}
