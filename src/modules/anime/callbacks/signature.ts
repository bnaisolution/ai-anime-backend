import { createHmac, timingSafeEqual } from 'node:crypto';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_NONCE_CACHE_ENTRIES = 5000;
const nonceLruCache = new Map<string, number>();
function evictExpiredOrOverflowNonces(nowMs: number): void {
  for (const [key, expiresAt] of nonceLruCache.entries()) {
    if (expiresAt <= nowMs) nonceLruCache.delete(key);
  }
  while (nonceLruCache.size >= MAX_NONCE_CACHE_ENTRIES) {
    const oldestKey = nonceLruCache.keys().next().value;
    if (oldestKey === undefined) break;
    nonceLruCache.delete(oldestKey);
  }
}
export function signCallbackPayload(timestampSec: string, rawBody: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`, 'utf8').digest('hex');
  return `sha256=${digest}`;
}
export function verifyCallbackSignature(input: { rawBody: string; signatureHeader: string | undefined; timestampHeader: string | undefined; nonceHeader?: string | undefined; secret: string; }): void {
  const signatureRaw = input.signatureHeader?.trim();
  const timestampRaw = input.timestampHeader?.trim();
  if (!signatureRaw || !timestampRaw) throw new AnimeError({ code: AnimeErrorCode.CALLBACK_SIGNATURE_INVALID, message: 'Missing callback signature or timestamp.' });
  const timestampSec = Number(timestampRaw);
  if (!Number.isFinite(timestampSec) || timestampSec <= 0) throw new AnimeError({ code: AnimeErrorCode.CALLBACK_SIGNATURE_INVALID, message: 'Invalid callback timestamp.' });
  const nowMs = Date.now();
  if (Math.abs(nowMs - timestampSec * 1000) > FIVE_MINUTES_MS) throw new AnimeError({ code: AnimeErrorCode.CALLBACK_SIGNATURE_INVALID, message: 'Callback timestamp outside 5-minute window.' });
  const expectedSig = signCallbackPayload(timestampRaw, input.rawBody, input.secret);
  const normalizedProvided = signatureRaw.startsWith('sha256=') ? signatureRaw : `sha256=${signatureRaw}`;
  const expectedBuf = Buffer.from(expectedSig, 'utf8'); const providedBuf = Buffer.from(normalizedProvided, 'utf8');
  if (expectedBuf.length !== providedBuf.length || timingSafeEqual(expectedBuf, providedBuf) === false) throw new AnimeError({ code: AnimeErrorCode.CALLBACK_SIGNATURE_INVALID, message: 'HMAC signature failed.' });
  evictExpiredOrOverflowNonces(nowMs);
  const nonceKey = input.nonceHeader?.trim() || `${timestampRaw}:${normalizedProvided}`;
  const existingExpiry = nonceLruCache.get(nonceKey);
  if (existingExpiry !== undefined && existingExpiry > nowMs) throw new AnimeError({ code: AnimeErrorCode.CALLBACK_REPLAY, message: 'Callback replay detected.' });
  nonceLruCache.delete(nonceKey); nonceLruCache.set(nonceKey, nowMs + FIVE_MINUTES_MS);
}
