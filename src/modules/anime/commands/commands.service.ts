import { createHash, randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { getHydratedInfrastructureForUser } from '../infrastructure/infrastructure.service';
import { animeSupabase } from '../db/anime.supabase';
import { redactSensitivePayload } from '../../../security/payloadRedaction';
import { DEFAULT_DOMAIN_PROMPTS, canonicalMediumKey, type PromptCategory } from '../prompts/creative.registry';
import { buildProjectCreativeContext, creativeConfigurationSnapshot, loadCreativePromptRows, type ProjectCreativeContext } from '../prompts/creative.service';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { flags } from '../../../config/flags';
import { evaluateProjectSetup } from '../../ai/director/director.readiness';
import {
  findCommandById,
  findCommandByIdempotencyKey,
  insertCommandAtomic,
} from './commands.repo';
import type { CreateCommandBody } from './commands.schema';
import {
  type ApiCommandRecord,
  COMMAND_INTENT_WF_MAP,
  CommandIntent,
  CommandStatus,
  type WorkflowKey,
} from './commands.types';

const PRODUCTION_INTENTS = new Set<CommandIntent>([
  CommandIntent.GENERATE_EPISODE,
  CommandIntent.CONTINUE_EPISODE,
  CommandIntent.REGENERATE_EPISODE,
  CommandIntent.RUN_QC,
  CommandIntent.PUBLISH_NOW,
]);

async function assertProjectSetupForProduction(_userId: string, body: CreateCommandBody): Promise<void> {
  if (!flags.projectSetupGate || !PRODUCTION_INTENTS.has(body.intent)) return;
  const { data: project, error } = await animeSupabase
    .from('projects')
    .select('id, user_id, name, genre, visual_medium, visual_style, story_bible')
    .eq('id', body.project_id)
    .maybeSingle<Record<string, unknown>>();
  if (error || !project) {
    throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Project not found or access denied.' });
  }
  const [castRes, versionRes] = await Promise.all([
    animeSupabase
      .from('characters')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', body.project_id),
    animeSupabase
      .from('bible_versions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', body.project_id),
  ]);
  const setup = evaluateProjectSetup(project, {
    castCount: Number(castRes.count || 0),
    bibleVersionCount: Number(versionRes.count || 0),
  });
  if (!setup?.ready_for_production) {
    const missing = [...(setup?.missing_settings || [])];
    if (!setup?.cast_ready) missing.push('characters');
    if (!setup?.bible_approved) missing.push('bible_approval');
    const error = new AnimeError({
      code: AnimeErrorCode.STAGE_DEPENDENCY_BLOCKED,
      httpStatus: 422,
      message: `Finish ${setup?.next_step || 'project_settings'} before production.`,
    });
    (error as any).missing = missing;
    (error as any).next_step = setup?.next_step || 'project_settings';
    (error as any).deep_link = setup?.deep_link || 'project_detail';
    throw error;
  }
}

async function assertPublishApproval(userId: string, body: CreateCommandBody): Promise<void> {
  if (body.intent !== CommandIntent.PUBLISH_NOW) return;
  const seasonNo = Number(body.season_no || 1);
  const episodeNo = Number(body.episode_no || 1);
  const { data: episode, error } = await animeSupabase
    .from('episodes')
    .select('episode_no, season_no, qc_status, approval_status, current_state')
    .eq('project_id', body.project_id)
    .eq('season_no', seasonNo)
    .eq('episode_no', episodeNo)
    .maybeSingle<Record<string, unknown>>();
  if (error || !episode) {
    const approvalError = new AnimeError({
      code: AnimeErrorCode.STAGE_DEPENDENCY_BLOCKED,
      httpStatus: 422,
      message: `Episode S${seasonNo}E${episodeNo} does not exist yet.`,
    });
    (approvalError as any).missing = ['episode'];
    (approvalError as any).deep_link = 'episodes';
    throw approvalError;
  }

  const qc = String(episode.qc_status || '').toUpperCase();
  const episodeApproval = String(episode.approval_status || '').toUpperCase();
  const missing: string[] = [];
  if (!['PASS', 'PASSED', 'APPROVED', 'QC_PASSED'].includes(qc)) missing.push('qc_pass');
  if (episodeApproval !== 'APPROVED') {
    missing.push('episode_approval');
    const episodeResource = `${seasonNo}:${episodeNo}`;
    const { data: existingEpisodeApproval } = await animeSupabase
      .from('approval_decisions')
      .select('id')
      .eq('project_id', body.project_id)
      .eq('type', 'EPISODE_APPROVAL')
      .eq('resource_id', episodeResource)
      .eq('status', 'PENDING')
      .maybeSingle();
    if (!existingEpisodeApproval) {
      await animeSupabase.from('approval_decisions').insert({
        project_id: body.project_id,
        type: 'EPISODE_APPROVAL',
        resource_id: episodeResource,
        resource_version: 1,
        requested_by: 'system',
        approver_role: 'reviewer',
        exact_diff: { season_no: seasonNo, episode_no: episodeNo, requested_by: userId },
        risk: 'MEDIUM',
        status: 'PENDING',
        expires_at: null,
      });
    }
  }
  if (missing.length > 0) {
    const approvalError = new AnimeError({
      code: AnimeErrorCode.APPROVAL_REQUIRED,
      httpStatus: 422,
      message: `Episode S${seasonNo}E${episodeNo} needs QC and explicit episode approval before publishing.`,
    });
    (approvalError as any).missing = missing;
    (approvalError as any).deep_link = 'review_inbox';
    throw approvalError;
  }

  const resourceId = `${seasonNo}:${episodeNo}`;
  const { data: decisions } = await animeSupabase
    .from('approval_decisions')
    .select('id, status')
    .eq('project_id', body.project_id)
    .eq('type', 'PUBLISH')
    .eq('resource_id', resourceId)
    .order('created_at', { ascending: false })
    .limit(10);
  const rows = Array.isArray(decisions) ? decisions : [];
  if (rows.some((row) => String(row.status || '').toUpperCase() === 'APPROVED')) return;
  if (!rows.some((row) => String(row.status || '').toUpperCase() === 'PENDING')) {
    await animeSupabase.from('approval_decisions').insert({
      project_id: body.project_id,
      type: 'PUBLISH',
      resource_id: resourceId,
      resource_version: 1,
      requested_by: 'system',
      approver_role: 'owner',
      exact_diff: { season_no: seasonNo, episode_no: episodeNo, requested_by: userId },
      risk: 'HIGH',
      status: 'PENDING',
      expires_at: null,
    });
  }
  const approvalError = new AnimeError({
    code: AnimeErrorCode.APPROVAL_REQUIRED,
    httpStatus: 422,
    message: `Publish approval is pending for S${seasonNo}E${episodeNo}. Approve it in Review Inbox, then publish again.`,
  });
  (approvalError as any).missing = ['publish_approval'];
  (approvalError as any).deep_link = 'review_inbox';
  throw approvalError;
}

export interface SubmitCommandParams {
  readonly idempotencyKey: string | undefined;
  readonly userId: string;
  readonly requestId: string;
  readonly body: CreateCommandBody;
}

export interface SubmitCommandResult {
  readonly command: ApiCommandRecord;
  readonly wf_key: WorkflowKey;
  readonly idempotent_replay: boolean;
}

function canonicalizeValue(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeValue(item));
  }
  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const canonicalObj: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const v = record[key];
    if (v !== undefined) {
      canonicalObj[key] = canonicalizeValue(v);
    }
  }
  return canonicalObj;
}

export function computeCommandBodyHash(body: CreateCommandBody): string {
  const normalized = canonicalizeValue({
    intent: body.intent,
    project_id: body.project_id,
    mode: body.mode ?? (body.intent === CommandIntent.QUICK_GENERATE_REEL ? 'QUICK' : 'SAVE'),
    episode_no: body.episode_no ?? 1,
    project_style: body.project_style ?? { visual_style: 'ANIME' },
    payload: body.payload ?? {},
  });
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function sanitizeCommandForResponse(command: ApiCommandRecord): ApiCommandRecord {
  return {
    ...command,
    payload: redactSensitivePayload(command.payload),
  };
}

function assertIdempotencyMatch(
  existing: ApiCommandRecord,
  bodyHash: string,
  params: SubmitCommandParams
): void {
  if (
    existing.body_hash !== bodyHash ||
    existing.project_id !== params.body.project_id ||
    existing.user_id !== params.userId
  ) {
    throw new AnimeError({
      code: AnimeErrorCode.IDEMPOTENCY_CONFLICT,
      message: 'Idempotency-Key has already been used with a different request payload or project.',
    });
  }
}

async function resolveEpisodePromptOverride(
  userId: string,
  projectId: string,
  episodeNo: number,
  seasonNo: number
): Promise<{ id: string; title: string; prompt_text: string; prompt_category?: string; version?: number } | null> {
  if (!Number.isInteger(episodeNo) || episodeNo < 1) return null;
  let episodeQuery = animeSupabase
    .from('episodes')
    .select('script_json')
    .eq('project_id', projectId)
    .eq('episode_no', episodeNo);
  if (Number.isInteger(seasonNo) && seasonNo > 0) episodeQuery = episodeQuery.eq('season_no', seasonNo);
  const { data: episodeRow } = await episodeQuery.maybeSingle<{ script_json?: Record<string, unknown> | null }>();
  const scriptJson = episodeRow?.script_json;
  const promptId = scriptJson && typeof scriptJson === 'object'
    ? scriptJson.prompt_id
    : null;
  if (typeof promptId !== 'string' || !promptId) return null;

  const { data: promptRows } = await animeSupabase
    .from('user_system_prompts')
    .select('id, title, prompt_text, prompt_category, version')
    .eq('id', promptId)
    .eq('user_id', userId)
    .eq('is_archived', false)
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .limit(1);
  const prompt = Array.isArray(promptRows) ? promptRows[0] : null;
  if (!prompt || String(prompt.prompt_category || '').toUpperCase() !== 'EPISODE') return null;
  return prompt;
}

interface SeasonPlanContext {
  readonly season_no: number;
  readonly title: string;
  readonly status: string;
  readonly arc: string;
  readonly goals: string;
  readonly blueprint: string;
  readonly episode_start: number;
  readonly episode_end: number;
  readonly genres: string[];
  readonly locked: boolean;
  readonly prompt_overrides: Record<string, string>;
  readonly season_prompt_id?: string | null;
  readonly season_prompt_title?: string;
  readonly season_prompt_text?: string;
  readonly ai_director_prompt_id?: string | null;
  readonly ai_director_prompt_title?: string;
  readonly ai_director_prompt_text?: string;
  readonly source: 'STORY_BIBLE';
}

function seasonPlanFromBible(
  bible: Record<string, unknown> | null | undefined,
  seasonNo: number
): SeasonPlanContext | null {
  if (!bible || typeof bible !== 'object') return null;
  const rawSeasons = (bible as Record<string, unknown>).seasons;
  if (!Array.isArray(rawSeasons)) return null;
  const season = rawSeasons.find((entry: any) => Number(entry?.season_no) === seasonNo);
  if (!season || typeof season !== 'object') return null;
  const rawGenres = Array.isArray((season as any).genres) ? (season as any).genres : [];
  const rawOverrides = (season as any).prompt_overrides;
  const overrides: Record<string, string> = {};
  if (rawOverrides && typeof rawOverrides === 'object') {
    for (const [key, value] of Object.entries(rawOverrides)) {
      if (typeof value === 'string' && value.trim()) overrides[key] = value.trim();
    }
  }
  const episodeStart = Number((season as any).episode_start);
  const episodeEnd = Number((season as any).episode_end);
  return {
    season_no: seasonNo,
    title: String((season as any).title ?? ''),
    status: String((season as any).status ?? 'PLANNED'),
    arc: String((season as any).arc ?? ''),
    goals: String((season as any).goals ?? ''),
    blueprint: String((season as any).blueprint ?? ''),
    episode_start: Number.isFinite(episodeStart) && episodeStart > 0 ? Math.round(episodeStart) : 1,
    episode_end: Number.isFinite(episodeEnd) && episodeEnd > 0 ? Math.round(episodeEnd) : 1,
    genres: rawGenres
      .map((genre: unknown) => String(genre ?? '').trim())
      .filter((genre: string) => genre.length > 0),
    locked: (season as any).locked === true || String((season as any).locked ?? '').toLowerCase() === 'true',
    prompt_overrides: overrides,
    source: 'STORY_BIBLE',
  };
}

async function resolveOwnedPromptById(
  userId: string,
  projectId: string,
  promptId: string,
  expectedCategory?: string
): Promise<{ id: string; title: string; prompt_text: string; prompt_category?: string; version?: number } | null> {
  if (!promptId) return null;
  const { data } = await animeSupabase
    .from('user_system_prompts')
    .select('id, title, prompt_text, prompt_category, version')
    .eq('id', promptId)
    .eq('user_id', userId)
    .eq('is_archived', false)
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .limit(1);
  const prompt = Array.isArray(data) ? data[0] : null;
  if (!prompt) return null;
  if (expectedCategory && String(prompt.prompt_category || '').toUpperCase() !== expectedCategory) return null;
  return prompt;
}

async function resolveDynamicPromptAndInfra(
  userId: string,
  projectId: string,
  workflowKey: WorkflowKey,
  episodeNo: number,
  seasonNo: number
) {
  let systemPromptTitle = 'Default Story Bible Architect';
  let customSystemPrompt = DEFAULT_DOMAIN_PROMPTS.BIBLE;
  let imageSystemPrompt = DEFAULT_DOMAIN_PROMPTS.IMAGE;
  let imageSystemPromptTitle = 'Default Visual Keyframe Prompt';
  let imageSystemPromptId: string | null = null;
  let imageSystemPromptVersion = 1;
  let systemPromptId: string | null = null;
  let systemPromptCategory: PromptCategory | null = 'BIBLE';
  let systemPromptVersion = 1;
  let episodePromptOverride = false;
  let seasonContext: SeasonPlanContext | null = null;
  let seasonPromptOverride = false;
  let imagePromptSeasonOverride = false;
  let seriesConfig: Record<string, number> = {
    total_seasons: 1,
    episodes_per_season: 12,
    episode_duration_min: 24,
    script_word_count: 1500,
    target_duration_sec: 1440,
    total_episode_capacity: 12,
    target_episode_count: 12,
  };
  let creativeContext: ProjectCreativeContext = buildProjectCreativeContext(
    { id: projectId, genre: 'Action Fantasy', visual_medium: 'ANIME', story_bible: {} },
    []
  );

  try {
    const { data: projectRow } = await animeSupabase
      .from('projects')
      .select('id, genre, visual_medium, active_system_prompt_id, story_bible')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle<{
        id?: string;
        genre?: string | null;
        visual_medium?: string | null;
        active_system_prompt_id?: string | null;
        story_bible?: Record<string, unknown> | null;
      }>();

    if (projectRow) {
      const bible = (projectRow.story_bible && typeof projectRow.story_bible === 'object')
        ? projectRow.story_bible
        : {};
      const bounded = (value: unknown, fallback: number, min: number, max: number): number => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, Math.round(parsed)));
      };
      const totalSeasons = bounded(bible.total_seasons, 1, 1, 100);
      const episodesPerSeason = bounded(bible.episodes_per_season, 12, 1, 500);
      const episodeDurationMin = bounded(bible.episode_duration_min, 24, 1, 120);
      seriesConfig = {
        total_seasons: totalSeasons,
        episodes_per_season: episodesPerSeason,
        episode_duration_min: episodeDurationMin,
        script_word_count: bounded(bible.script_word_count, 1500, 100, 20000),
        target_duration_sec: episodeDurationMin * 60,
        total_episode_capacity: totalSeasons * episodesPerSeason,
        target_episode_count: bounded(bible.target_episode_count, totalSeasons * episodesPerSeason, 1, 50000),
      };

      seasonContext = seasonPlanFromBible(projectRow.story_bible, seasonNo);
      if (seasonContext?.prompt_overrides.season) {
        const seasonPrompt = await resolveOwnedPromptById(
          userId,
          projectId,
          seasonContext.prompt_overrides.season,
          'SEASON'
        );
        if (seasonPrompt) {
          seasonContext = {
            ...seasonContext,
            season_prompt_id: seasonPrompt.id,
            season_prompt_title: seasonPrompt.title,
            season_prompt_text: seasonPrompt.prompt_text,
          };
        }
      }
      if (seasonContext?.prompt_overrides.ai_director) {
        const directorPrompt = await resolveOwnedPromptById(
          userId,
          projectId,
          seasonContext.prompt_overrides.ai_director,
          'AI_DIRECTOR'
        );
        if (directorPrompt) {
          seasonContext = {
            ...seasonContext,
            ai_director_prompt_id: directorPrompt.id,
            ai_director_prompt_title: directorPrompt.title,
            ai_director_prompt_text: directorPrompt.prompt_text,
          };
        }
      }
      const creativeRows = await loadCreativePromptRows(userId, projectId);
      creativeContext = buildProjectCreativeContext({
        id: projectId,
        genre: projectRow.genre,
        visual_medium: projectRow.visual_medium,
        story_bible: projectRow.story_bible,
      }, creativeRows, { extraGenres: seasonContext?.genres ?? [] });
    }

    if (projectRow?.active_system_prompt_id) {
      const { data: promptRows } = await animeSupabase
        .from('user_system_prompts')
        .select('id, title, prompt_text, prompt_category, version')
        .eq('id', projectRow.active_system_prompt_id)
        .eq('user_id', userId)
        .eq('is_archived', false)
        .limit(1);
      const activePrompt = Array.isArray(promptRows) ? promptRows[0] : null;
      if (activePrompt && String(activePrompt.prompt_category || '').toUpperCase() === 'BIBLE') {
        systemPromptId = activePrompt.id || null;
        systemPromptCategory = 'BIBLE';
        systemPromptVersion = Number(activePrompt.version || 1);
        systemPromptTitle = activePrompt.title || systemPromptTitle;
        customSystemPrompt = activePrompt.prompt_text || customSystemPrompt;
      }
    }

    if (workflowKey === 'WF-02') {
      const episodePrompt = await resolveEpisodePromptOverride(userId, projectId, episodeNo, seasonNo);
      if (episodePrompt) {
        episodePromptOverride = true;
        systemPromptId = episodePrompt.id;
        systemPromptCategory = 'EPISODE';
        systemPromptVersion = Number(episodePrompt.version || 1);
        systemPromptTitle = episodePrompt.title || systemPromptTitle;
        customSystemPrompt = episodePrompt.prompt_text || customSystemPrompt;
      } else if (seasonContext?.prompt_overrides.episode) {
        const seasonEpisodePrompt = await resolveOwnedPromptById(
          userId,
          projectId,
          seasonContext.prompt_overrides.episode,
          'EPISODE'
        );
        if (seasonEpisodePrompt) {
          seasonPromptOverride = true;
          systemPromptId = seasonEpisodePrompt.id;
          systemPromptCategory = 'EPISODE';
          systemPromptVersion = Number(seasonEpisodePrompt.version || 1);
          systemPromptTitle = seasonEpisodePrompt.title || systemPromptTitle;
          customSystemPrompt = seasonEpisodePrompt.prompt_text || customSystemPrompt;
        }
      }
    }

    const { data: imageRows } = await animeSupabase
      .from('user_system_prompts')
      .select('id, title, prompt_text, version')
      .eq('user_id', userId)
      .eq('prompt_category', 'IMAGE')
      .eq('is_archived', false)
      .or(`project_id.eq.${projectId},project_id.is.null`)
      .order('is_favorite', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);
    const imagePrompt = Array.isArray(imageRows) ? imageRows[0] : null;
    if (imagePrompt?.prompt_text) {
      imageSystemPrompt = imagePrompt.prompt_text;
      imageSystemPromptTitle = imagePrompt.title || imageSystemPromptTitle;
      imageSystemPromptId = imagePrompt.id || null;
      imageSystemPromptVersion = Number(imagePrompt.version || 1);
    }

    if (seasonContext?.prompt_overrides.image) {
      const seasonImagePrompt = await resolveOwnedPromptById(
        userId,
        projectId,
        seasonContext.prompt_overrides.image,
        'IMAGE'
      );
      if (seasonImagePrompt) {
        imagePromptSeasonOverride = true;
        imageSystemPrompt = seasonImagePrompt.prompt_text || imageSystemPrompt;
        imageSystemPromptTitle = seasonImagePrompt.title || imageSystemPromptTitle;
        imageSystemPromptId = seasonImagePrompt.id || null;
        imageSystemPromptVersion = Number(seasonImagePrompt.version || 1);
      }
    }
  } catch (_) {}

  let hydratedInfra: Record<string, unknown> = {};
  try {
    hydratedInfra = await getHydratedInfrastructureForUser(userId);
  } catch (_) {}

  return {
    visualMedium: creativeContext.visualMedium,
    visualMediumTitle: creativeContext.visualMediumTitle,
    genreContext: creativeContext.genrePromptContext,
    mediumPromptContext: creativeContext.mediumPromptContext,
    creativeContext,
    systemPromptTitle,
    customSystemPrompt,
    imageSystemPrompt,
    imageSystemPromptTitle,
    imageSystemPromptId,
    imageSystemPromptVersion,
    hydratedInfra,
    systemPromptId,
    systemPromptCategory,
    systemPromptVersion,
    episodePromptOverride,
    seasonContext,
    seasonPromptOverride,
    imagePromptSeasonOverride,
    seriesConfig,
  };
}

export async function submitAnimeCommand(
  params: SubmitCommandParams
): Promise<SubmitCommandResult> {
  const rawKey = params.idempotencyKey?.trim();
  if (!rawKey) {
    throw new AnimeError({
      code: AnimeErrorCode.MISSING_IDEMPOTENCY,
      message: 'Header Idempotency-Key is required for all command submissions.',
    });
  }
  if (params.body.intent === CommandIntent.UPDATE_PROJECT_SETTINGS) {
    throw new AnimeError({
      code: AnimeErrorCode.OUTPUT_INVALID,
      message: 'Project settings are updated through the project settings screen or AI Director action, not a workflow command.',
    });
  }
  const wfKey = COMMAND_INTENT_WF_MAP[params.body.intent];
  if (!wfKey) {
    throw new AnimeError({
      code: AnimeErrorCode.WORKFLOW_CONTRACT_MISMATCH,
      message: `Unsupported or unmapped command intent: ${String(params.body.intent)}`,
    });
  }
  const bodyHash = computeCommandBodyHash(params.body);
  const existing = await findCommandByIdempotencyKey(rawKey);
  if (existing) {
    assertIdempotencyMatch(existing, bodyHash, params);
    return {
      command: sanitizeCommandForResponse(existing),
      wf_key: COMMAND_INTENT_WF_MAP[existing.intent],
      idempotent_replay: true,
    };
  }

  await assertProjectSetupForProduction(params.userId, params.body);
  await assertPublishApproval(params.userId, params.body);

  const commandId = randomUUID();
  const effectiveMode =
    params.body.mode ??
    (params.body.intent === CommandIntent.QUICK_GENERATE_REEL ? 'QUICK' : 'SAVE');
  const episodeNo = params.body.episode_no ?? 1;
  const seasonNo = params.body.season_no ?? 1;

  const dynamicCtx = await resolveDynamicPromptAndInfra(
    params.userId,
    params.body.project_id,
    wfKey,
    episodeNo,
    seasonNo
  );

  const payloadObj = (params.body.payload ?? {}) as Record<string, unknown>;
  const baseHash = typeof payloadObj.base_hash === 'string'
    ? payloadObj.base_hash
    : typeof payloadObj.baseHash === 'string'
      ? payloadObj.baseHash
      : '';
  const baseVersion = typeof payloadObj.base_version === 'number'
    ? payloadObj.base_version
    : typeof payloadObj.baseVersion === 'number'
      ? payloadObj.baseVersion
      : 0;
  const requestedVisualMediumRaw =
    (typeof payloadObj.visual_medium === 'string' ? payloadObj.visual_medium : null) ??
    (typeof (params.body.project_style as Record<string, unknown> | undefined)?.visual_medium === 'string'
      ? String((params.body.project_style as Record<string, unknown>).visual_medium)
      : null);
  const requestedVisualMedium = requestedVisualMediumRaw ? canonicalMediumKey(requestedVisualMediumRaw) : null;
  const resolvedVisualMedium = dynamicCtx.visualMedium;
  const mediumConflict = Boolean(requestedVisualMedium && requestedVisualMedium !== resolvedVisualMedium);
  const renderFamily = ['REAL_HUMAN', 'LIVE_ACTION', 'CINEMATIC'].includes(resolvedVisualMedium)
    ? 'REALISTIC'
    : 'ANIME';

  const resolvedPromptTitle =
    (typeof payloadObj.system_prompt_title === 'string' ? payloadObj.system_prompt_title : null) ??
    dynamicCtx.systemPromptTitle;

  const resolvedCustomSystemPrompt =
    (typeof payloadObj.custom_system_prompt === 'string' ? payloadObj.custom_system_prompt : null) ??
    dynamicCtx.customSystemPrompt;

  const resolvedImageSystemPrompt =
    (typeof payloadObj.image_system_prompt === 'string' ? payloadObj.image_system_prompt : null) ??
    dynamicCtx.imageSystemPrompt;

  const systemPromptConfig = {
    id: dynamicCtx.systemPromptId,
    prompt_category: dynamicCtx.systemPromptCategory,
    prompt_version: dynamicCtx.systemPromptVersion,
    episode_override: dynamicCtx.episodePromptOverride,
    visual_medium: resolvedVisualMedium,
    visual_medium_title: dynamicCtx.visualMediumTitle,
    visual_medium_prompt_id: dynamicCtx.creativeContext.mediumPrompt.promptId,
    visual_medium_prompt_version: dynamicCtx.creativeContext.mediumPrompt.version,
    selected_genres: dynamicCtx.creativeContext.selectedGenres,
    season_no: seasonNo,
    season_context: dynamicCtx.seasonContext,
    season_prompt_override: dynamicCtx.seasonPromptOverride,
    genre_prompts: dynamicCtx.creativeContext.genrePrompts.map((prompt) => ({
      key: prompt.key,
      title: prompt.title,
      prompt_id: prompt.promptId,
      version: prompt.version,
      custom: prompt.custom,
    })),
    title: resolvedPromptTitle,
    prompt_text: resolvedCustomSystemPrompt,
    series_config: dynamicCtx.seriesConfig,
  };

  const imagePromptConfig = {
    id: dynamicCtx.imageSystemPromptId,
    version: dynamicCtx.imageSystemPromptVersion,
    title: dynamicCtx.imageSystemPromptTitle,
    visual_medium: resolvedVisualMedium,
    visual_medium_title: dynamicCtx.visualMediumTitle,
    visual_medium_prompt_id: dynamicCtx.creativeContext.mediumPrompt.promptId,
    visual_medium_prompt_version: dynamicCtx.creativeContext.mediumPrompt.version,
    visual_medium_prompt: dynamicCtx.mediumPromptContext,
    season_prompt_override: dynamicCtx.imagePromptSeasonOverride,
    prompt_text: resolvedImageSystemPrompt,
  };

  const explicitTargetSec = Number(payloadObj.target_duration_sec ?? payloadObj.targetDurationSec);
  const canonicalTargetSec = Number.isFinite(explicitTargetSec) && explicitTargetSec > 0
    ? Math.max(15, Math.min(6 * 60 * 60, Math.round(explicitTargetSec)))
    : Number(dynamicCtx.seriesConfig.target_duration_sec) || 1440;

  const projectStyle = {
    ...(params.body.project_style ?? {}),
    ...((payloadObj.project_style as Record<string, unknown> | undefined) ?? {}),
    visual_style: renderFamily,
    render_family: renderFamily,
    visual_medium: resolvedVisualMedium,
    visual_medium_title: dynamicCtx.visualMediumTitle,
    visual_medium_prompt: dynamicCtx.mediumPromptContext,
    visual_medium_prompt_id: dynamicCtx.creativeContext.mediumPrompt.promptId,
    visual_medium_prompt_version: dynamicCtx.creativeContext.mediumPrompt.version,
    selected_genres: dynamicCtx.creativeContext.selectedGenres,
    season_no: seasonNo,
    season_context: dynamicCtx.seasonContext,
    season_prompt_override: dynamicCtx.seasonPromptOverride,
    genre_prompts: dynamicCtx.creativeContext.genrePrompts.map((prompt) => ({
      key: prompt.key,
      title: prompt.title,
      prompt_id: prompt.promptId,
      version: prompt.version,
      prompt_text: prompt.promptText,
      custom: prompt.custom,
    })),
    genre_prompt_context: dynamicCtx.genreContext,
    requested_visual_medium: requestedVisualMedium,
    medium_conflict: mediumConflict,
    system_prompt_id: dynamicCtx.systemPromptId,
    system_prompt_category: dynamicCtx.systemPromptCategory,
    system_prompt_version: dynamicCtx.systemPromptVersion,
    episode_prompt_override: dynamicCtx.episodePromptOverride,
    system_prompt_title: resolvedPromptTitle,
    custom_system_prompt: resolvedCustomSystemPrompt,
    image_system_prompt: resolvedImageSystemPrompt,
    image_prompt_config: imagePromptConfig,
    series_config: dynamicCtx.seriesConfig,
    total_seasons: dynamicCtx.seriesConfig.total_seasons,
    episodes_per_season: dynamicCtx.seriesConfig.episodes_per_season,
    episode_duration_min: dynamicCtx.seriesConfig.episode_duration_min,
    script_word_count: dynamicCtx.seriesConfig.script_word_count,
    target_duration_sec: canonicalTargetSec,
  };

  const configurationSnapshot = creativeConfigurationSnapshot(
    { id: params.body.project_id, genre: dynamicCtx.creativeContext.selectedGenres.join(', '), visual_medium: resolvedVisualMedium },
    dynamicCtx.creativeContext,
    dynamicCtx.seriesConfig
  );

  const userInfrastructure = {
    ...dynamicCtx.hydratedInfra,
    ...(params.body.user_infrastructure ?? {}),
    ...((payloadObj.user_infrastructure as Record<string, unknown> | undefined) ?? {}),
  };

  const userPrompt =
    params.body.userPrompt ??
    (typeof payloadObj.userPrompt === 'string'
      ? payloadObj.userPrompt
      : typeof payloadObj.user_prompt === 'string'
        ? payloadObj.user_prompt
        : typeof payloadObj.prompt === 'string'
          ? payloadObj.prompt
          : '');

  const enrichedPayload: Record<string, unknown> = {
    ...payloadObj,
    intent: params.body.intent,
    mode: effectiveMode,
    episode_no: episodeNo,
    episode_number: episodeNo,
    season_no: seasonNo,
    userPrompt,
    user_prompt: userPrompt,
    baseHash,
    baseVersion,
    visual_medium: resolvedVisualMedium,
    visual_medium_title: dynamicCtx.visualMediumTitle,
    visual_medium_prompt: dynamicCtx.mediumPromptContext,
    visual_medium_prompt_id: dynamicCtx.creativeContext.mediumPrompt.promptId,
    visual_medium_prompt_version: dynamicCtx.creativeContext.mediumPrompt.version,
    requested_visual_medium: requestedVisualMedium,
    medium_conflict: mediumConflict,
    selected_genres: dynamicCtx.creativeContext.selectedGenres,
    season_context: dynamicCtx.seasonContext,
    season_prompt_override: dynamicCtx.seasonPromptOverride,
    genre_prompts: dynamicCtx.creativeContext.genrePrompts.map((prompt) => ({
      key: prompt.key,
      title: prompt.title,
      prompt_id: prompt.promptId,
      version: prompt.version,
      prompt_text: prompt.promptText,
      custom: prompt.custom,
    })),
    genre_prompt_context: dynamicCtx.genreContext,
    configuration_snapshot: configurationSnapshot,
    system_prompt_id: dynamicCtx.systemPromptId,
    system_prompt_category: dynamicCtx.systemPromptCategory,
    episode_prompt_override: dynamicCtx.episodePromptOverride,
    system_prompt_title: resolvedPromptTitle,
    custom_system_prompt: resolvedCustomSystemPrompt,
    image_system_prompt: resolvedImageSystemPrompt,
    image_prompt_config: imagePromptConfig,
    system_prompt_config: systemPromptConfig,
    project_style: projectStyle,
    series_config: { ...dynamicCtx.seriesConfig, target_duration_sec: canonicalTargetSec },
    target_duration_sec: canonicalTargetSec,
    user_infrastructure: userInfrastructure,
    gpu_routing: userInfrastructure.gpu_routing ?? {},
    telegram_storage: userInfrastructure.telegram_storage ?? {},
    wf_key: wfKey,
    request_id: params.requestId,
  };

  const outboxPayload: Record<string, unknown> = {
    command_id: commandId,
    project_id: params.body.project_id,
    user_id: params.userId,
    intent: params.body.intent,
    wf_key: wfKey,
    mode: effectiveMode,
    episode_no: episodeNo,
    episode_number: episodeNo,
    season_no: seasonNo,
    userPrompt,
    user_prompt: userPrompt,
    baseHash,
    baseVersion,
    visual_medium: resolvedVisualMedium,
    visual_medium_title: dynamicCtx.visualMediumTitle,
    visual_medium_prompt: dynamicCtx.mediumPromptContext,
    visual_medium_prompt_id: dynamicCtx.creativeContext.mediumPrompt.promptId,
    visual_medium_prompt_version: dynamicCtx.creativeContext.mediumPrompt.version,
    requested_visual_medium: requestedVisualMedium,
    medium_conflict: mediumConflict,
    selected_genres: dynamicCtx.creativeContext.selectedGenres,
    season_context: dynamicCtx.seasonContext,
    season_prompt_override: dynamicCtx.seasonPromptOverride,
    genre_prompts: dynamicCtx.creativeContext.genrePrompts.map((prompt) => ({
      key: prompt.key,
      title: prompt.title,
      prompt_id: prompt.promptId,
      version: prompt.version,
      prompt_text: prompt.promptText,
      custom: prompt.custom,
    })),
    genre_prompt_context: dynamicCtx.genreContext,
    configuration_snapshot: configurationSnapshot,
    system_prompt_id: dynamicCtx.systemPromptId,
    system_prompt_category: dynamicCtx.systemPromptCategory,
    episode_prompt_override: dynamicCtx.episodePromptOverride,
    system_prompt_title: resolvedPromptTitle,
    custom_system_prompt: resolvedCustomSystemPrompt,
    image_system_prompt: resolvedImageSystemPrompt,
    image_prompt_config: imagePromptConfig,
    system_prompt_config: systemPromptConfig,
    project_style: projectStyle,
    series_config: { ...dynamicCtx.seriesConfig, target_duration_sec: canonicalTargetSec },
    target_duration_sec: canonicalTargetSec,
    user_infrastructure: userInfrastructure,
    gpu_routing: userInfrastructure.gpu_routing ?? {},
    telegram_storage: userInfrastructure.telegram_storage ?? {},
    idempotency_key: rawKey,
    request_id: params.requestId,
    payload: enrichedPayload,
  };

  const persistedPayload = redactSensitivePayload(enrichedPayload);
  const persistedOutboxPayload = redactSensitivePayload(outboxPayload);

  const createdOrExisting = await insertCommandAtomic({
    command_id: commandId,
    project_id: params.body.project_id,
    user_id: params.userId,
    intent: params.body.intent,
    payload: persistedPayload,
    status: CommandStatus.QUEUED,
    idempotency_key: rawKey,
    body_hash: bodyHash,
    outbox_type: 'dispatch_n8n',
    outbox_payload: persistedOutboxPayload,
  });

  if (createdOrExisting.id !== commandId) {
    assertIdempotencyMatch(createdOrExisting, bodyHash, params);
    return {
      command: sanitizeCommandForResponse(createdOrExisting),
      wf_key: COMMAND_INTENT_WF_MAP[createdOrExisting.intent],
      idempotent_replay: true,
    };
  }

  await writeAudit({
    project_id: params.body.project_id,
    user_id: params.userId,
    episode_no: episodeNo,
    workflow_name: wfKey,
    action: params.body.intent,
    entity_type: 'API_COMMAND',
    entity_id: createdOrExisting.id,
    new_value: {
      command_id: createdOrExisting.id,
      status: createdOrExisting.status,
      mode: effectiveMode,
      visual_medium: resolvedVisualMedium,
      selected_genres: dynamicCtx.creativeContext.selectedGenres,
      medium_conflict: mediumConflict,
      project_style: projectStyle,
      idempotency_key: rawKey,
    },
    request_id: params.requestId,
  });

  return {
    command: sanitizeCommandForResponse(createdOrExisting),
    wf_key: wfKey,
    idempotent_replay: false,
  };
}

export async function getAnimeCommandForUser(
  commandId: string,
  userId: string
): Promise<ApiCommandRecord> {
  const command = await findCommandById(commandId);
  if (!command) {
    throw new AnimeError({
      code: AnimeErrorCode.PROJECT_FORBIDDEN,
      message: 'Command not found or access denied.',
    });
  }
  if (command.user_id !== userId) {
    const { data: projectRow } = await animeSupabase
      .from('projects')
      .select('id, user_id')
      .eq('id', command.project_id)
      .maybeSingle<{ id: string; user_id: string | null }>();
    if (!projectRow || projectRow.user_id !== userId) {
      throw new AnimeError({
        code: AnimeErrorCode.PROJECT_FORBIDDEN,
        message: 'You do not have permission to view this command.',
      });
    }
  }
  return sanitizeCommandForResponse(command);
}

