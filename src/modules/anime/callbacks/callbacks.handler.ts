import { randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { animeEnv } from '../config/anime.env';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { insertCallback } from './callbacks.repo';
import { verifyCallbackSignature } from './signature';
export async function handleCallbackRequest(input: { source: 'n8n' | 'worker'; rawBody: string; signatureHeader: string | undefined; timestampHeader: string | undefined; nonceHeader: string | undefined; requestId: string; }): Promise<any> {
  const secret = input.source === 'n8n' ? animeEnv.ANIME_N8N_CALLBACK_SECRET : animeEnv.ANIME_WORKER_CALLBACK_SECRET;
  verifyCallbackSignature({ rawBody: input.rawBody, signatureHeader: input.signatureHeader, timestampHeader: input.timestampHeader, nonceHeader: input.nonceHeader, secret });
  let payload: any; try { payload = JSON.parse(input.rawBody); } catch (e) { throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Invalid JSON' }); }
  const projectId = typeof payload.project_id === 'string' ? payload.project_id.trim() : null;
  if (!projectId) throw new AnimeError({ code: AnimeErrorCode.WORKFLOW_CONTRACT_MISMATCH, message: 'Missing project_id' });
  const callbackId = payload.callback_id || payload.execution_id || payload.command_id || input.requestId;
  const dedupe = await insertCallback({ project_id: projectId, source: input.source, callback_id: callbackId, raw_payload: payload, verified: true });
  if (dedupe.duplicate) return { accepted: true, duplicate: true, callback_id: callbackId, project_id: projectId };
  const commandId = typeof payload.command_id === 'string' ? payload.command_id : null;
  await animeSupabase.from('outbox_events').insert({ id: randomUUID(), type: 'reconcile_command', payload: { project_id: projectId, command_id: commandId, callback_id: callbackId, source: input.source, request_id: input.requestId, callback_payload: payload }, status: 'pending', attempts: 0 });
  await writeAudit({ project_id: projectId, workflow_name: payload.wf_key || `CALLBACK_${input.source.toUpperCase()}`, action: 'CALLBACK_RECEIVED', entity_type: 'CALLBACK_INBOX', entity_id: callbackId, new_value: { source: input.source, callback_id: callbackId, command_id: commandId }, request_id: input.requestId });
  return { accepted: true, duplicate: false, callback_id: callbackId, project_id: projectId };
}
