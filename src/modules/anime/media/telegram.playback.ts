import { createHmac, timingSafeEqual } from 'node:crypto';

const SCOPE = 'media_playback';
const DEFAULT_TTL_SECONDS = 15 * 60;

export interface MediaPlaybackClaims {
  fileId: string;
  projectId: string;
  userId: string;
  expiresAt: number;
}

function secret(): string {
  return String(process.env.MEDIA_PLAYBACK_SECRET || process.env.ANIME_WORKFLOW_GATEWAY_TOKEN || '').trim();
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function mintMediaPlaybackToken(input: {
  fileId: string;
  projectId: string;
  userId: string;
  ttlSeconds?: number;
}): string {
  const key = secret();
  if (!key) throw new Error('Media playback secret is not configured.');
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, input.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const payload = Buffer.from(JSON.stringify({
    s: SCOPE,
    f: input.fileId,
    p: input.projectId,
    u: input.userId,
    e: expiresAt,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyMediaPlaybackToken(token: unknown): MediaPlaybackClaims | null {
  const key = secret();
  if (!key || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (parsed.s !== SCOPE) return null;
    const fileId = typeof parsed.f === 'string' ? parsed.f : '';
    const projectId = typeof parsed.p === 'string' ? parsed.p : '';
    const userId = typeof parsed.u === 'string' ? parsed.u : '';
    const expiresAt = typeof parsed.e === 'number' ? parsed.e : 0;
    if (!fileId || !projectId || !userId) return null;
    if (expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return { fileId, projectId, userId, expiresAt };
  } catch (_error) {
    return null;
  }
}
