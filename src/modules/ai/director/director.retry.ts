import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AuthContext } from '../../../plugins/auth';
import { animeSupabase } from '../../anime/db/anime.supabase';
import { submitAnimeCommand } from '../../anime/commands/commands.service';
import { AnimeError, AnimeErrorCode } from '../../anime/errors/anime.errors';

const RETRYABLE_INTENTS = new Set([
  'GENERATE_EPISODE',
  'CONTINUE_EPISODE',
  'REGENERATE_EPISODE',
  'RUN_QC',
  'PUBLISH_NOW',
]);

const RETRYABLE_STATUSES = new Set(['FAILED', 'DEFERRED', 'MANUAL_REVIEW']);

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function retryDirectorCommand(
  _fastify: FastifyInstance,
  auth: AuthContext,
  input: { projectId: string; commandId: string; requestId?: string | null }
): Promise<{
  intent: string;
  command_id: string;
  status: string;
  idempotent_replay: boolean;
}> {
  const { data, error } = await animeSupabase
    .from('api_commands')
    .select('id, user_id, intent, payload, status')
    .eq('id', input.commandId)
    .eq('project_id', input.projectId)
    .maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Command lookup failed', cause: error });
  if (!data) throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Command not found.' });

  const command = data as Record<string, unknown>;
  if (String(command.user_id || '') !== auth.userId) {
    throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Command belongs to another user.' });
  }

  const intent = String(command.intent || '');
  const status = String(command.status || '').toUpperCase();
  if (!RETRYABLE_INTENTS.has(intent)) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'This command type cannot be retried from the Director timeline.' });
  }
  if (!RETRYABLE_STATUSES.has(status)) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Only failed, deferred, or manual-review commands can be retried.' });
  }

  const payload = command.payload && typeof command.payload === 'object' && !Array.isArray(command.payload)
    ? command.payload as Record<string, unknown>
    : {};
  const episodeNo = asNumber(payload.episode_no ?? payload.episode_number, 1);
  const seasonNo = asNumber(payload.season_no ?? payload.season_number, 1);
  const mode = String(payload.mode || 'SAVE');

  const result = await submitAnimeCommand({
    idempotencyKey: `retry:${input.commandId}:${randomUUID()}`,
    userId: auth.userId,
    requestId: input.requestId || 'director-retry',
    body: {
      intent: intent as never,
      project_id: input.projectId,
      mode: (mode === 'QUICK' ? 'QUICK' : 'SAVE'),
      episode_no: episodeNo,
      season_no: seasonNo,
      payload,
    },
  });

  return {
    intent,
    command_id: result.command.id,
    status: result.command.status || 'QUEUED',
    idempotent_replay: result.idempotent_replay,
  };
}
