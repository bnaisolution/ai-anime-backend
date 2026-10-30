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
  const projectStyle = params.body.project_style ??
    (params.body.payload?.project_style as { visual_style: 'ANIME' | 'REALISTIC' } | undefined) ?? {
      visual_style: 'ANIME',
    };
  const userInfrastructure =
    params.body.user_infrastructure ??
    (params.body.payload?.user_infrastructure as Record<string, unknown> | undefined) ??
    {};
  const userPrompt =
    params.body.userPrompt ??
    (typeof params.body.payload?.userPrompt === 'string'
      ? params.body.payload.userPrompt
      : typeof params.body.payload?.user_prompt === 'string'
        ? params.body.payload.user_prompt
        : '');

  const enrichedPayload: Record<string, unknown> = {
    ...(params.body.payload ?? {}),
    intent: params.body.intent,
    mode: effectiveMode,
    episode_no: episodeNo,
    episode_number: episodeNo,
    season_no: seasonNo,
    userPrompt,
    user_prompt: userPrompt,
    project_style: projectStyle,
    user_infrastructure: userInfrastructure,
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
    project_style: projectStyle,
    user_infrastructure: userInfrastructure,
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
