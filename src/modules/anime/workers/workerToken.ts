import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { animeEnv } from '../config/anime.env';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export type WorkerJobScope = 'tts' | 'ffmpeg' | 'media' | 'health';

export interface WorkerJobTokenInput {
  job_id: string;
  project_id: string;
  tenant_id?: string | null;
  user_id: string;
  scope: WorkerJobScope[];
  ttl_seconds?: number;
}

export interface WorkerJobTokenClaims {
  iss: 'anime-backend';
  aud: 'anime-cpu-worker';
  sub: string;
  job_id: string;
  project_id: string;
  tenant_id: string | null;
  user_id: string;
  scope: WorkerJobScope[];
  iat: number;
  exp: number;
  jti: string;
}

const ISSUER = 'anime-backend';
const AUDIENCE = 'anime-cpu-worker';
const DEFAULT_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 900;
const CLOCK_SKEW_SECONDS = 60;

function tokenSecret(): string {
  const secret = animeEnv.ANIME_WORKER_JOB_TOKEN_SECRET || animeEnv.ANIME_WORKER_CALLBACK_SECRET;
  if (!secret) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Worker token secret is not configured.' });
  return secret;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', tokenSecret()).update(payload, 'utf8').digest('base64url');
}

export function mintWorkerJobToken(input: WorkerJobTokenInput, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const ttl = Math.min(Math.max(input.ttl_seconds ?? DEFAULT_TTL_SECONDS, 1), MAX_TTL_SECONDS);
  const claims: WorkerJobTokenClaims = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: input.job_id,
    job_id: input.job_id,
    project_id: input.project_id,
    tenant_id: input.tenant_id ?? null,
    user_id: input.user_id,
    scope: input.scope,
    iat: nowSeconds,
    exp: nowSeconds + ttl,
    jti: randomUUID(),
  };
  const payload = base64Url(JSON.stringify(claims));
  return `${payload}.${sign(payload)}`;
}

export function verifyWorkerJobToken(
  token: string,
  requiredScope: WorkerJobScope,
  nowSeconds = Math.floor(Date.now() / 1000),
): WorkerJobTokenClaims {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Malformed worker token.' });
  }
  const [payload, providedSignature] = parts;
  const expectedSignature = sign(payload);
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  if (expectedBuffer.length !== providedBuffer.length || timingSafeEqual(expectedBuffer, providedBuffer) === false) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Worker token signature failed.' });
  }

  let claims: WorkerJobTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as WorkerJobTokenClaims;
  } catch (_error) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Worker token payload is invalid.' });
  }

  if (claims.iss !== ISSUER || claims.aud !== AUDIENCE) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Worker token issuer or audience is invalid.' });
  }
  if (!claims.jti || !claims.job_id || !claims.project_id || !claims.user_id || !Array.isArray(claims.scope)) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Worker token is missing required claims.' });
  }
  if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Worker token has expired.' });
  }
  if (!Number.isFinite(claims.iat) || claims.iat > nowSeconds + CLOCK_SKEW_SECONDS) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Worker token issued-at is invalid.' });
  }
  if (!claims.scope.includes(requiredScope)) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: `Worker token is missing scope ${requiredScope}.` });
  }
  return claims;
}
