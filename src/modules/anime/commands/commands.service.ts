import { createHash, randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { getHydratedInfrastructureForUser } from '../infrastructure/infrastructure.service';
import { animeSupabase } from '../db/anime.supabase';
import { redactSensitivePayload } from '../../../security/payloadRedaction';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
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
  episodeNo: number
): Promise<{ id: string; title: string; visual_medium?: string; prompt_text: string; prompt_category?: string } | null> {
  if (!Number.isInteger(episodeNo) || episodeNo < 1) return null;
  const { data: episodeRow } = await animeSupabase
    .from('episodes')
    .select('script_json')
    .eq('project_id', projectId)
    .eq('episode_no', episodeNo)
    .maybeSingle<{ script_json?: Record<string, unknown> | null }>();
  const scriptJson = episodeRow?.script_json;
  const promptId = scriptJson && typeof scriptJson === 'object'
    ? scriptJson.prompt_id
    : null;
  if (typeof promptId !== 'string' || !promptId) return null;

  const { data: promptRows } = await animeSupabase
    .from('user_system_prompts')
    .select('id, title, visual_medium, prompt_text, prompt_category')
    .eq('id', promptId)
    .eq('user_id', userId)
    .eq('is_archived', false)
    .limit(1);
  const prompt = Array.isArray(promptRows) ? promptRows[0] : null;
  if (!prompt || String(prompt.prompt_category || '').toUpperCase() !== 'EPISODE') return null;
  return prompt;
}

async function resolveDynamicPromptAndInfra(
  userId: string,
  projectId: string,
  workflowKey: WorkflowKey,
  episodeNo: number
) {
  let visualMedium = 'ANIME';
  let systemPromptTitle = 'Default Storyteller';
  let customSystemPrompt = '';
  let imageSystemPrompt = '';
  let systemPromptId: string | null = null;
  let systemPromptCategory: string | null = null;
  let episodePromptOverride = false;
  let seriesConfig: Record<string, number> = {
    total_seasons: 1,
    episodes_per_season: 12,
    episode_duration_min: 24,
  };

  try {
    const { data: projectRow } = await animeSupabase
      .from('projects')
      .select('visual_medium, active_system_prompt_id, story_bible')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle<{
        visual_medium?: string;
        active_system_prompt_id?: string | null;
        story_bible?: Record<string, unknown> | null;
      }>();

    if (projectRow?.visual_medium) {
      visualMedium = projectRow.visual_medium.toUpperCase();
    }

    const bible = (projectRow?.story_bible && typeof projectRow.story_bible === 'object')
      ? projectRow.story_bible
      : {};
    const bounded = (value: unknown, fallback: number, min: number, max: number): number => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.min(max, Math.max(min, Math.round(parsed)));
    };
    seriesConfig = {
      total_seasons: bounded(bible.total_seasons, 1, 1, 100),
      episodes_per_season: bounded(bible.episodes_per_season, bounded(bible.target_episode_count, 12, 1, 500), 1, 500),
      episode_duration_min: bounded(bible.episode_duration_min, 24, 1, 120),
    };

    let promptQuery = animeSupabase
      .from('user_system_prompts')
      .select('id, title, visual_medium, prompt_text, prompt_category')
      .eq('user_id', userId)
      .eq('prompt_category', 'BIBLE')
      .or(`project_id.eq.${projectId},project_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (projectRow?.active_system_prompt_id) {
      promptQuery = animeSupabase
        .from('user_system_prompts')
        .select('id, title, visual_medium, prompt_text, prompt_category')
        .eq('id', projectRow.active_system_prompt_id)
        .eq('user_id', userId)
        .limit(1);
    }

    const { data: promptRows } = await promptQuery;
    const activePrompt = Array.isArray(promptRows) ? promptRows[0] : null;
    if (activePrompt) {
      systemPromptId = activePrompt.id || null;
      systemPromptCategory = String(activePrompt.prompt_category || 'BIBLE').toUpperCase();
      systemPromptTitle = activePrompt.title || systemPromptTitle;
      customSystemPrompt = activePrompt.prompt_text || '';
      if (activePrompt.visual_medium) {
        visualMedium = String(activePrompt.visual_medium).toUpperCase();
      }
    }

    if (workflowKey === 'WF-02') {
      const episodePrompt = await resolveEpisodePromptOverride(userId, projectId, episodeNo);
      if (episodePrompt) {
        episodePromptOverride = true;
        systemPromptId = episodePrompt.id;
        systemPromptCategory = 'EPISODE';
        systemPromptTitle = episodePrompt.title || systemPromptTitle;
        customSystemPrompt = episodePrompt.prompt_text || '';
        if (episodePrompt.visual_medium) {
          visualMedium = String(episodePrompt.visual_medium).toUpperCase();
        }
      }
    }

    const { data: imageRows } = await animeSupabase
      .from('user_system_prompts')
      .select('id, title, prompt_text')
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
    }
  } catch (_) {}

  let hydratedInfra: Record<string, unknown> = {};
  try {
    hydratedInfra = await getHydratedInfrastructureForUser(userId);
  } catch (_) {}

  return {
    visualMedium,
    systemPromptTitle,
    customSystemPrompt,
    imageSystemPrompt,
    hydratedInfra,
    systemPromptId,
    systemPromptCategory,
    episodePromptOverride,
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
    episodeNo
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
  const resolvedVisualMedium =
    (typeof payloadObj.visual_medium === 'string' ? payloadObj.visual_medium : null) ??
    params.body.project_style?.visual_style ??
    dynamicCtx.visualMedium ??
    'ANIME';

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
    episode_override: dynamicCtx.episodePromptOverride,
    visual_medium: resolvedVisualMedium,
    title: resolvedPromptTitle,
    prompt_text: resolvedCustomSystemPrompt,
    series_config: dynamicCtx.seriesConfig,
  };

  const imagePromptConfig = {
    visual_medium: resolvedVisualMedium,
    prompt_text: resolvedImageSystemPrompt,
  };

  const projectStyle = {
    ...(params.body.project_style ?? {}),
    ...((payloadObj.project_style as Record<string, unknown> | undefined) ?? {}),
    visual_style: resolvedVisualMedium === 'REAL_HUMAN' ? 'REALISTIC' : 'ANIME',
    visual_medium: resolvedVisualMedium,
    system_prompt_id: dynamicCtx.systemPromptId,
    system_prompt_category: dynamicCtx.systemPromptCategory,
    episode_prompt_override: dynamicCtx.episodePromptOverride,
    system_prompt_title: resolvedPromptTitle,
    custom_system_prompt: resolvedCustomSystemPrompt,
    image_system_prompt: resolvedImageSystemPrompt,
    series_config: dynamicCtx.seriesConfig,
    total_seasons: dynamicCtx.seriesConfig.total_seasons,
    episodes_per_season: dynamicCtx.seriesConfig.episodes_per_season,
    episode_duration_min: dynamicCtx.seriesConfig.episode_duration_min,
  };

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
    system_prompt_id: dynamicCtx.systemPromptId,
    system_prompt_category: dynamicCtx.systemPromptCategory,
    episode_prompt_override: dynamicCtx.episodePromptOverride,
    system_prompt_title: resolvedPromptTitle,
    custom_system_prompt: resolvedCustomSystemPrompt,
    image_system_prompt: resolvedImageSystemPrompt,
    image_prompt_config: imagePromptConfig,
    system_prompt_config: systemPromptConfig,
    project_style: projectStyle,
    series_config: dynamicCtx.seriesConfig,
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
    system_prompt_id: dynamicCtx.systemPromptId,
    system_prompt_category: dynamicCtx.systemPromptCategory,
    episode_prompt_override: dynamicCtx.episodePromptOverride,
    system_prompt_title: resolvedPromptTitle,
    custom_system_prompt: resolvedCustomSystemPrompt,
    image_system_prompt: resolvedImageSystemPrompt,
    image_prompt_config: imagePromptConfig,
    system_prompt_config: systemPromptConfig,
    project_style: projectStyle,
    series_config: dynamicCtx.seriesConfig,
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

