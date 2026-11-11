import { timingSafeEqual } from 'node:crypto';
import { animeEnv } from '../config/anime.env';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

const MAX_SKEW_MS = 5 * 60 * 1000;
const MAX_NONCES = 10000;
const nonceCache = new Map<string, number>();

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function purgeNonces(nowMs: number): void {
  for (const [nonce, expiresAt] of nonceCache.entries()) {
    if (expiresAt <= nowMs) nonceCache.delete(nonce);
  }
  while (nonceCache.size >= MAX_NONCES) {
    const oldest = nonceCache.keys().next().value;
    if (oldest === undefined) break;
    nonceCache.delete(oldest);
  }
}

export function verifyGatewayHeaders(input: {
  token: string | undefined;
  expectedToken: string | undefined;
  timestamp: string | undefined;
  nonce: string | undefined;
  nowMs?: number;
}): void {
  if (!input.expectedToken) {
    throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Workflow gateway token is not configured.' });
  }
  if (!input.token || !safeEqual(input.token, input.expectedToken)) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Invalid workflow gateway token.' });
  }
  const timestampMs = Number(input.timestamp);
  const nowMs = input.nowMs ?? Date.now();
  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > MAX_SKEW_MS) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Workflow gateway timestamp is outside the allowed window.' });
  }
  const nonce = String(input.nonce || '').trim();
  if (!nonce || nonce.length > 256) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Workflow gateway nonce is required.' });
  }
  purgeNonces(nowMs);
  if (nonceCache.has(nonce)) {
    throw new AnimeError({ code: AnimeErrorCode.CALLBACK_REPLAY, message: 'Workflow gateway request replay detected.' });
  }
  nonceCache.set(nonce, nowMs + MAX_SKEW_MS);
}

export function readGatewayHeaders(request: any): { token: string | undefined; timestamp: string | undefined; nonce: string | undefined; systemToken: string | undefined } {
  const headers = request?.headers || {};
  const read = (name: string): string | undefined => {
    const value = headers[name];
    return typeof value === 'string' ? value.trim() : Array.isArray(value) ? String(value[0] || '').trim() : undefined;
  };
  return {
    token: read('x-anime-workflow-token'),
    timestamp: read('x-anime-timestamp'),
    nonce: read('x-anime-nonce'),
    systemToken: read('x-anime-workflow-system-token'),
  };
}

export function verifyWorkflowGatewayRequest(request: any, system = false): void {
  const headers = readGatewayHeaders(request);
  verifyGatewayHeaders({
    token: system ? headers.systemToken : headers.token,
    expectedToken: system ? animeEnv.ANIME_WORKFLOW_SYSTEM_TOKEN : animeEnv.ANIME_WORKFLOW_GATEWAY_TOKEN,
    timestamp: headers.timestamp,
    nonce: headers.nonce,
  });
}

export function clearGatewayNonceCacheForTests(): void {
  nonceCache.clear();
}
