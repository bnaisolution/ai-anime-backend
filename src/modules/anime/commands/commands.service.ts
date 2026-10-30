import { createHash, randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { findCommandById, findCommandByIdempotencyKey, insertCommandAtomic } from './commands.repo';
import type { CreateCommandBody } from './commands.schema';
import { type ApiCommandRecord, COMMAND_INTENT_WF_MAP, CommandIntent, CommandStatus } from './commands.types';

// FIXED: Using actual exported function name from infrastructure.service.ts
async function resolveSavedUserInfrastructure(userId: string): Promise<Record<string, unknown>> {
  try {
    const infraMod: any = await import('../infrastructure/infrastructure.service');
    if (typeof infraMod.getDecryptedMapForUser === 'function') {
      const res = await infraMod.getDecryptedMapForUser(userId);
      if (res && typeof res === 'object') return res as Record<string, unknown>;
    }
  } catch (_e) {}
  return {};
}

async function safePreflight(projectId: string, intent: CommandIntent) {
  try {
    const mod: any = await import('../intelligence/planner.service');
    if (mod && typeof mod.preflightCheck === 'function') {
      await mod.preflightCheck(projectId, intent);
    }
  } catch (e) {
    if (e instanceof AnimeError) throw e; 
  }
}

async function safeContext(projectId: string, intent: CommandIntent) {
  try {
    const mod: any = await import('../intelligence/memory.service');
    if (mod && typeof mod.retrieveContext === 'function') {
      return await mod.retrieveContext(projectId, intent);
    }
  } catch (_e) {}
  return [];
}

export async function submitAnimeCommand(params: { idempotencyKey: string | undefined; userId: string; requestId: string; body: CreateCommandBody; }): Promise<any> {
  const rawKey = params.idempotencyKey?.trim();
  if (!rawKey) throw new AnimeError({ code: AnimeErrorCode.MISSING_IDEMPOTENCY, message: 'Header Idempotency-Key is required.' });

  const wfKey = COMMAND_INTENT_WF_MAP[params.body.intent];
  if (!wfKey) throw new AnimeError({ code: AnimeErrorCode.WORKFLOW_CONTRACT_MISMATCH, message: `Unsupported intent: ${String(params.body.intent)}` });

  const bodyHash = createHash('sha256').update(JSON.stringify(params.body)).digest('hex');
  const existing = await findCommandByIdempotencyKey(rawKey);
  
  if (existing) {
    if (existing.body_hash !== bodyHash || existing.project_id !== params.body.project_id) {
      throw new AnimeError({ code: AnimeErrorCode.IDEMPOTENCY_CONFLICT, message: 'Idempotency-Key conflict with different payload.' });
    }
    return { command_id: existing.id, command: existing, wf_key: COMMAND_INTENT_WF_MAP[existing.intent], idempotent_replay: true };
  }

  await safePreflight(params.body.project_id, params.body.intent);
  const memories = await safeContext(params.body.project_id, params.body.intent);

  const commandId = randomUUID();
  const effectiveMode = params.body.mode ?? (params.body.intent === CommandIntent.QUICK_GENERATE_REEL ? 'QUICK' : 'SAVE');
  const episodeNo = params.body.episode_no ?? 1;
  const seasonNo = params.body.season_no ?? 1;
  const projectStyle = params.body.project_style ?? (params.body.payload?.project_style as { visual_style: 'ANIME' | 'REALISTIC' } | undefined) ?? { visual_style: 'ANIME' };

  const savedInfra = await resolveSavedUserInfrastructure(params.userId);
  const bodyInfra = params.body.user_infrastructure ?? (params.body.payload?.user_infrastructure as Record<string, unknown> | undefined) ?? {};
  const userInfrastructure = { ...savedInfra, ...bodyInfra };

  const userPrompt = params.body.userPrompt ?? (params.body as any).user_prompt ?? (typeof params.body.payload?.userPrompt === 'string' ? params.body.payload.userPrompt : typeof params.body.payload?.prompt === 'string' ? params.body.payload.prompt : '');

  const enrichedPayload = { ...(params.body.payload ?? {}), intent: params.body.intent, mode: effectiveMode, episode_no: episodeNo, episode_number: episodeNo, season_no: seasonNo, userPrompt, user_prompt: userPrompt, project_style: projectStyle, user_infrastructure: userInfrastructure, wf_key: wfKey, request_id: params.requestId, memories };

  const outboxPayload = { command_id: commandId, project_id: params.body.project_id, user_id: params.userId, intent: params.body.intent, wf_key: wfKey, mode: effectiveMode, episode_no: episodeNo, episode_number: episodeNo, season_no: seasonNo, userPrompt, user_prompt: userPrompt, project_style: projectStyle, user_infrastructure: userInfrastructure, idempotency_key: rawKey, request_id: params.requestId, payload: enrichedPayload };

  const created = await insertCommandAtomic({ command_id: commandId, project_id: params.body.project_id, user_id: params.userId, intent: params.body.intent, payload: enrichedPayload, status: CommandStatus.QUEUED, idempotency_key: rawKey, body_hash: bodyHash, outbox_type: 'dispatch_n8n', outbox_payload: outboxPayload });

  await writeAudit({ project_id: params.body.project_id, user_id: params.userId, episode_no: episodeNo, workflow_name: wfKey, action: params.body.intent, entity_type: 'API_COMMAND', entity_id: created.id, new_value: { command_id: created.id, status: created.status, mode: effectiveMode }, request_id: params.requestId });

  return { command_id: created.id, command: created, wf_key: wfKey, idempotent_replay: false };
}

export async function getAnimeCommandForUser(commandId: string, userId: string): Promise<ApiCommandRecord> {
  const command = await findCommandById(commandId);
  if (!command) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Command not found.' });
  if (command.user_id !== userId) {
    const { data: proj } = await animeSupabase.from('projects').select('id, user_id').eq('id', command.project_id).maybeSingle();
    if (!proj || (proj.user_id && proj.user_id !== userId)) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Access denied.' });
  }
  return command;
}
