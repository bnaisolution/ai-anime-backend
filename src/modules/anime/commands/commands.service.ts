import { createHash, randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { animeSupabase } from '../db/anime.supabase';
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

async function resolveDynamicPromptAndInfra(userId: string, projectId: string) {
  let visualMedium = 'ANIME';
  let systemPromptTitle = 'Default Storyteller';
  let customSystemPrompt = '';

  try {
    const { data: projectRow } = await animeSupabase
      .from('projects')
      .select('visual_medium, active_system_prompt_id')
      .eq('id', projectId)
      .maybeSingle<{ visual_medium?: string; active_system_prompt_id?: string | null }>();

    if (projectRow?.visual_medium) {
      visualMedium = projectRow.visual_medium.toUpperCase();
    }

    let promptQuery = animeSupabase
      .from('user_system_prompts')
      .select('id, title, visual_medium, prompt_text')
      .order('created_at', { ascending: false })
      .limit(1);

    if (projectRow?.active_system_prompt_id) {
      promptQuery = animeSupabase
        .from('user_system_prompts')
        .select('id, title, visual_medium, prompt_text')
        .eq('id', projectRow.active_system_prompt_id)
        .limit(1);
    } else {
      promptQuery = promptQuery.eq('user_id', userId);
    }

    const { data: promptRows } = await promptQuery;
    const activePrompt = Array.isArray(promptRows) ? promptRows[0] : null;
    if (activePrompt) {
      systemPromptTitle = activePrompt.title || systemPromptTitle;
      customSystemPrompt = activePrompt.prompt_text || '';
      if (activePrompt.visual_medium) {
        visualMedium = String(activePrompt.visual_medium).toUpperCase();
      }
    }
  } catch (_) {}

  const hydratedInfra: Record<string, unknown> = {};
  try {
    const { data: infraRows } = await animeSupabase
      .from('user_infrastructure')
      .select('provider_type, config, status')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (Array.isArray(infraRows)) {
      for (const row of infraRows) {
        const pType = String(row.provider_type || '');
        const cfg = (row.config && typeof row.config === 'object') ? (row.config as Record<string, unknown>) : {};
        hydratedInfra[pType] = cfg;
        if (cfg.gpu_routing) hydratedInfra.gpu_routing = cfg.gpu_routing;
        if (cfg.telegram_storage) hydratedInfra.telegram_storage = cfg.telegram_storage;
        if (cfg.github_worker) hydratedInfra.github_worker = cfg.github_worker;
      }
    }
  } catch (_) {}

  return {
    visualMedium,
    systemPromptTitle,
    customSystemPrompt,
    hydratedInfra,
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
    if (
      existing.body_hash !== bodyHash ||
      existing.project_id !== params.body.project_id
    ) {
      throw new AnimeError({
        code: AnimeErrorCode.IDEMPOTENCY_CONFLICT,
        message: 'Idempotency-Key has already been used with a different request payload or project.',
      });
    }
    return {
      command: existing,
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

  const dynamicCtx = await resolveDynamicPromptAndInfra(params.userId, params.body.project_id);

  const payloadObj = (params.body.payload ?? {}) as Record<string, unknown>;
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

  const systemPromptConfig = {
    visual_medium: resolvedVisualMedium,
    title: resolvedPromptTitle,
    prompt_text: resolvedCustomSystemPrompt,
  };

  const projectStyle = {
    ...(params.body.project_style ?? {}),
    ...((payloadObj.project_style as Record<string, unknown> | undefined) ?? {}),
    visual_style: resolvedVisualMedium === 'REAL_HUMAN' ? 'REALISTIC' : 'ANIME',
    visual_medium: resolvedVisualMedium,
    system_prompt_title: resolvedPromptTitle,
    custom_system_prompt: resolvedCustomSystemPrompt,
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
    visual_medium: resolvedVisualMedium,
    system_prompt_title: resolvedPromptTitle,
    custom_system_prompt: resolvedCustomSystemPrompt,
    system_prompt_config: systemPromptConfig,
    project_style: projectStyle,
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
    visual_medium: resolvedVisualMedium,
    system_prompt_title: resolvedPromptTitle,
    custom_system_prompt: resolvedCustomSystemPrompt,
    system_prompt_config: systemPromptConfig,
    project_style: projectStyle,
    user_infrastructure: userInfrastructure,
    gpu_routing: userInfrastructure.gpu_routing ?? {},
    telegram_storage: userInfrastructure.telegram_storage ?? {},
    idempotency_key: rawKey,
    request_id: params.requestId,
    payload: enrichedPayload,
  };

  const createdOrExisting = await insertCommandAtomic({
    command_id: commandId,
    project_id: params.body.project_id,
    user_id: params.userId,
    intent: params.body.intent,
    payload: enrichedPayload,
    status: CommandStatus.QUEUED,
    idempotency_key: rawKey,
    body_hash: bodyHash,
    outbox_type: 'dispatch_n8n',
    outbox_payload: outboxPayload,
  });

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
    command: createdOrExisting,
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
  return command;
}

