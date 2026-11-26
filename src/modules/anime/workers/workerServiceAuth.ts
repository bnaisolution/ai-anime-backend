import { timingSafeEqual } from 'node:crypto';
import { animeEnv } from '../config/anime.env';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

function workerSecret(): string {
  const secret = animeEnv.ANIME_WORKER_JOB_TOKEN_SECRET || animeEnv.ANIME_WORKER_CALLBACK_SECRET;
  if (!secret) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Worker service secret is not configured.' });
  return secret;
}

function bearer(request: any): string {
  const header = String(request?.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Worker service token is required.' });
  return match[1].trim();
}

export function verifyWorkerServiceRequest(request: any): void {
  const expected = Buffer.from(workerSecret(), 'utf8');
  const provided = Buffer.from(bearer(request), 'utf8');
  if (expected.length !== provided.length || timingSafeEqual(expected, provided) === false) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Invalid worker service token.' });
  }
}
