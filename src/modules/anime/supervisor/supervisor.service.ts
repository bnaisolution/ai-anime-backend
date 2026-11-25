import { createHash, randomUUID } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { CommandStatus } from '../commands/commands.types';
import { insertCommandAtomic } from '../commands/commands.repo';
import { animeSupabase } from '../db/anime.supabase';
import { redactSensitivePayload } from '../../../security/payloadRedaction';
import { readCommandState } from './supervisor.repo';

const PRODUCTION_INTENTS = new Set(['GENERATE_EPISODE', 'REGENERATE_EPISODE', 'CONTINUE_EPISODE']);

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (value !== null && value !== undefined && value !== '' && Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function firstRecord(...values: unknown[]): Record<string, any> | null {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  }
  return null;
}

/**
 * WF-03 (and the GPU worker) wrap the production result under `callback_payload.result`.
 * The supervisor previously only looked at the top level, so real master URLs, duration and
 * file size were never persisted. This resolves both shapes.
 */
export function extractCallbackMedia(callbackPayload: unknown) {
  const cb = asRecord(callbackPayload);
  const result = asRecord(cb.result);
  const cbMedia = asRecord(cb.output_media);
  const resultMedia = asRecord(result.output_media);
  const finalVideoUrl = firstString(
    cb.final_video_url,
    cb.master_video_url,
    cbMedia.final_video_url,
    cbMedia.master_video_url,
    result.final_video_url,
    result.master_video_url,
    resultMedia.final_video_url,
    resultMedia.master_video_url
  );
  return {
    final_video_url: finalVideoUrl,
    full_audio_url: firstString(cb.full_audio_url, cbMedia.full_audio_url, result.full_audio_url, resultMedia.full_audio_url),
    thumbnail_url: firstString(cb.thumbnail_url, cbMedia.thumbnail_url, result.thumbnail_url, resultMedia.thumbnail_url),
    duration_sec: firstNumber(cb.duration_sec, cbMedia.duration_sec, result.duration_sec, resultMedia.duration_sec, resultMedia.actual_duration_sec),
    target_duration_sec: firstNumber(cb.target_duration_sec, cbMedia.target_duration_sec, result.target_duration_sec, resultMedia.target_duration_sec),
    file_size_bytes: firstNumber(cb.file_size_bytes, cbMedia.file_size_bytes, result.file_size_bytes, resultMedia.file_size_bytes),
    telegram_file_id: firstString(
      cb.telegram_master_file_id,
      cb.telegram_file_id,
      cbMedia.telegram_file_id,
      result.telegram_master_file_id,
      result.telegram_file_id,
      resultMedia.telegram_file_id
    ),
    qc_status: firstString(cb.qc_status, result.qc_status),
    season_no: firstNumber(cb.season_no, cb.season_number, result.season_no, result.season_number),
    audio_stats: firstRecord(cb.audio_stats, cbMedia.audio_stats, result.audio_stats, resultMedia.audio_stats),
  };
}

function mergeOutputMedia(existing: unknown, media: ReturnType<typeof extractCallbackMedia>): Record<string, any> {
  const base = asRecord(existing);
  const merged: Record<string, any> = { ...base };
  if (media.final_video_url) {
    merged.final_video_url = media.final_video_url;
    merged.master_video_url = media.final_video_url;
  }
  if (media.full_audio_url) merged.full_audio_url = media.full_audio_url;
  if (media.thumbnail_url) merged.thumbnail_url = media.thumbnail_url;
  if (media.duration_sec !== null) {
    merged.duration_sec = media.duration_sec;
    merged.actual_duration_sec = media.duration_sec;
  }
  if (media.target_duration_sec !== null) merged.target_duration_sec = media.target_duration_sec;
  if (media.file_size_bytes !== null) merged.file_size_bytes = media.file_size_bytes;
  if (media.telegram_file_id) merged.telegram_file_id = media.telegram_file_id;
  if (media.audio_stats) merged.audio_stats = media.audio_stats;
  merged.rendered_at = new Date().toISOString();
  return merged;
}

/**
 * Root cause of QC stuck at PENDING: WF-03 sets `qc_status='PENDING'` but never dispatches
 * WF-11. Enqueue an idempotent RUN_QC command through the existing command + outbox path so
 * the normal dispatcher (WF-00 -> WF-11) evaluates the real master.
 */
async function enqueueAutoQc(input: {
  project_id: string;
  user_id: string;
  command_id: string;
  season_no: number;
  episode_no: number;
  media: ReturnType<typeof extractCallbackMedia>;
}): Promise<void> {
  const { project_id, user_id, media } = input;
  if (!project_id || !user_id || !media.final_video_url) return;
  const dedupe = createHash('sha256').update(String(media.final_video_url)).digest('hex').slice(0, 16);
  const idempotencyKey = `auto_qc:${project_id}:s${input.season_no}:e${input.episode_no}:${dedupe}`;
  const commandId = randomUUID();
  const payload = {
    project_id,
    user_id,
    command_id: commandId,
    intent: 'RUN_QC',
    season_no: input.season_no,
    season_number: input.season_no,
    episode_no: input.episode_no,
    episode_number: input.episode_no,
    qc_intent: 'AUTO_QC',
    parent_command_id: input.command_id,
    media_url: media.final_video_url,
    final_video_url: media.final_video_url,
    duration_sec: media.duration_sec,
    actual_duration_sec: media.duration_sec,
    file_size_bytes: media.file_size_bytes,
    file_size: media.file_size_bytes,
    auto_qc: true,
  };
  const outboxPayload = { ...payload, wf_key: 'WF-11', mode: 'SAVE' };
  const bodyHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  try {
    await insertCommandAtomic({
      command_id: commandId,
      project_id,
      user_id,
      intent: 'RUN_QC',
      payload: redactSensitivePayload(payload),
      status: CommandStatus.QUEUED,
      idempotency_key: idempotencyKey,
      body_hash: bodyHash,
      outbox_type: 'dispatch_n8n',
      outbox_payload: redactSensitivePayload(outboxPayload),
    });
    await writeAudit({
      project_id,
      user_id,
      workflow_name: 'SUPERVISOR_AUTO_QC',
      action: 'AUTO_QC_DISPATCH_ENQUEUED',
      entity_type: 'API_COMMAND',
      entity_id: commandId,
      new_value: {
        parent_command_id: input.command_id,
        season_no: input.season_no,
        episode_no: input.episode_no,
        media_url_present: true,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Auto-QC must never block command reconciliation; schedule a durable retry via the outbox.
    console.warn('[Supervisor] Auto-QC enqueue failed', errorMessage);
    try {
      await animeSupabase.from('outbox_events').insert({
        id: randomUUID(),
        type: 'auto_qc_enqueue',
        payload: redactSensitivePayload({
          command_id: commandId,
          project_id,
          user_id,
          intent: 'RUN_QC',
          command_payload: redactSensitivePayload(payload),
          idempotency_key: idempotencyKey,
          body_hash: bodyHash,
          outbox_type: 'dispatch_n8n',
          outbox_payload: redactSensitivePayload(outboxPayload),
          parent_command_id: input.command_id,
          season_no: input.season_no,
          episode_no: input.episode_no,
        }),
        status: 'pending',
        attempts: 0,
      });
      try {
        await writeAudit({
          project_id,
          user_id,
          workflow_name: 'SUPERVISOR_AUTO_QC',
          action: 'AUTO_QC_ENQUEUE_RETRY_SCHEDULED',
          entity_type: 'API_COMMAND',
          entity_id: commandId,
          new_value: {
            parent_command_id: input.command_id,
            season_no: input.season_no,
            episode_no: input.episode_no,
            error: errorMessage.slice(0, 500),
          },
        });
      } catch (auditError) {
        console.error('[Supervisor] Auto-QC retry audit failed', auditError instanceof Error ? auditError.message : auditError);
      }
    } catch (retryError) {
      console.error('[Supervisor] Auto-QC retry enqueue failed', retryError instanceof Error ? retryError.message : retryError);
    }
  }
}

export async function reconcileCommand(input: { project_id: string, command_id: string, callback_payload?: any, request_id?: string }): Promise<any> {
  const snap = await readCommandState(input.project_id, input.command_id);
  if (snap.command === null) return { command_id: input.command_id, next_status: CommandStatus.FAILED };
  const prev = String(snap.command.status || '').toUpperCase(); const cb = input.callback_payload?.status?.toUpperCase(); const ep = snap.episode_state?.current_state?.toUpperCase();
  const intent = String(snap.command.intent || '').toUpperCase();
  const publishConfirmed = ep === 'PUBLISHED'
    || String(input.callback_payload?.publish_status || '').toUpperCase() === 'PUBLISHED'
    || input.callback_payload?.published === true
    || Boolean(input.callback_payload?.published_at);
  if (['SUCCEEDED', 'FAILED'].includes(prev)) return { command_id: input.command_id, next_status: prev };
  let next = CommandStatus.RECONCILING;
  if (intent === 'PUBLISH_NOW') {
    if (publishConfirmed) next = CommandStatus.SUCCEEDED;
    else if (['FAILED', 'ERROR', 'CANCELLED'].includes(cb) || ep?.endsWith('_FAILED')) next = CommandStatus.FAILED;
    else if (cb === 'MANUAL_REVIEW' || snap.pending_actions.length > 0) next = CommandStatus.MANUAL_REVIEW;
  } else if (['SUCCEEDED', 'COMPLETED'].includes(cb) || ['COMPLETED', 'PUBLISHED'].includes(ep)) next = CommandStatus.SUCCEEDED;
  else if (['FAILED', 'ERROR', 'CANCELLED'].includes(cb) || ep?.endsWith('_FAILED')) next = CommandStatus.FAILED;
  else if (cb === 'MANUAL_REVIEW' || snap.pending_actions.length > 0) next = CommandStatus.MANUAL_REVIEW;
  else if (prev === CommandStatus.RECONCILING) {
    const ageMs = Date.now() - new Date(snap.command.created_at || 0).getTime();
    if (ageMs > 30 * 60 * 1000) next = CommandStatus.MANUAL_REVIEW;
    else return { command_id: input.command_id, next_status: prev };
  }
  if (next !== prev) {
    await animeSupabase.from('api_commands').update({ status: next }).eq('project_id', input.project_id).eq('id', input.command_id);
    await writeAudit({ project_id: input.project_id, user_id: snap.command.user_id, workflow_name: 'SUPERVISOR_RECONCILER', action: 'COMMAND_STATE_RECONCILED', entity_type: 'API_COMMAND', entity_id: input.command_id, previous_value: { status: prev }, new_value: { status: next }, request_id: input.request_id });
    if (next === CommandStatus.SUCCEEDED && input.callback_payload) {
      const media = extractCallbackMedia(input.callback_payload);
      const payload = asRecord(snap.command.payload);
      const seasonNo = Number(payload.season_no || payload.season_number || media.season_no || 1);
      const epNo = snap.episode_state?.episode_no || payload.episode_no || payload.episode_number;
      if (epNo && (media.final_video_url || media.full_audio_url)) {
        const { data: existing } = await animeSupabase
          .from('episodes')
          .select('output_media')
          .eq('project_id', input.project_id)
          .eq('season_no', seasonNo)
          .eq('episode_no', Number(epNo))
          .maybeSingle<{ output_media?: Record<string, unknown> | null }>();
        const mergedMedia = mergeOutputMedia(existing?.output_media, media);
        await animeSupabase.from('episodes').update({ output_media: mergedMedia })
          .eq('project_id', input.project_id)
          .eq('season_no', seasonNo)
          .eq('episode_no', Number(epNo));
        await writeAudit({ project_id: input.project_id, user_id: snap.command.user_id, workflow_name: 'SUPERVISOR_MEDIA_SAVE', action: 'EPISODE_MEDIA_SAVED', entity_type: 'EPISODE', entity_id: String(epNo), new_value: { final_video_url: media.final_video_url, full_audio_url: media.full_audio_url, duration_sec: mergedMedia.duration_sec ?? null, file_size_bytes: mergedMedia.file_size_bytes ?? null }, request_id: input.request_id });
      }
      // WF-03 leaves qc_status='PENDING'; auto-dispatch WF-11 for real production masters.
      if (PRODUCTION_INTENTS.has(intent) && epNo && media.final_video_url) {
        await enqueueAutoQc({
          project_id: input.project_id,
          user_id: String(snap.command.user_id || ''),
          command_id: input.command_id,
          season_no: seasonNo,
          episode_no: Number(epNo),
          media,
        });
      }
    }
  }
  return { command_id: input.command_id, next_status: next };
}
