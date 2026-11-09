import { createHmac, createPublicKey, timingSafeEqual, verify as verifySignature } from 'node:crypto';
import { env } from '../../config/env';

export interface SupabaseJwtPayload {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  email?: string;
  role?: string;
  workspace_id?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SupabaseSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  userId: string;
  email: string;
  workspaceId: string;
  role: string;
}

export class SupabaseAuthError extends Error {
  public readonly httpStatus: number;
  public readonly category: string;
  public readonly retryable: boolean;

  constructor(message: string, httpStatus: number, category: string, retryable = false) {
    super(message);
    this.name = 'SupabaseAuthError';
    this.httpStatus = httpStatus;
    this.category = category;
    this.retryable = retryable;
  }
}

interface DecodedJwt {
  header: Record<string, unknown>;
  payload: SupabaseJwtPayload;
  signingInput: string;
  signature: Buffer;
}

interface JwkRecord {
  kid?: string;
  kty?: string;
  alg?: string;
  [key: string]: unknown;
}

interface JwksCache {
  url: string;
  keys: JwkRecord[];
  expiresAt: number;
}

let jwksCache: JwksCache | null = null;
const JWKS_CACHE_MS = 5 * 60 * 1000;

function anonKey(): string {
  return (process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '').trim();
}

function supabaseBaseUrl(): string {
  return env.SUPABASE_URL.replace(/\/+$/, '');
}

function supabaseAuthUrl(): string {
  return `${supabaseBaseUrl()}/auth/v1`;
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}

export function decodeJwt(token: string): DecodedJwt {
  const parts = token.split('.');
  if (parts.length !== 3) throw new SupabaseAuthError('Malformed JWT', 401, 'AUTH_INVALID');
  let header: Record<string, unknown>;
  let payload: SupabaseJwtPayload;
  try {
    header = JSON.parse(decodeBase64Url(parts[0]).toString('utf8')) as Record<string, unknown>;
    payload = JSON.parse(decodeBase64Url(parts[1]).toString('utf8')) as SupabaseJwtPayload;
  } catch (_e) {
    throw new SupabaseAuthError('Malformed JWT', 401, 'AUTH_INVALID');
  }
  return {
    header,
    payload,
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: decodeBase64Url(parts[2]),
  };
}

export function isSupabaseIssuer(issuer: unknown): boolean {
  return typeof issuer === 'string' && issuer === env.SUPABASE_JWT_ISSUER;
}

export function isSupabaseAuthConfigured(): boolean {
  return anonKey().length > 0;
}

function audienceMatches(value: string | string[] | undefined): boolean {
  const expected = env.SUPABASE_JWT_AUDIENCE;
  if (Array.isArray(value)) return value.includes(expected);
  return value === expected;
}

function validateClaims(payload: SupabaseJwtPayload): void {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
    throw new SupabaseAuthError('Invalid or expired token', 401, 'AUTH_INVALID');
  }
  if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds + 30) {
    throw new SupabaseAuthError('Token is not active yet', 401, 'AUTH_INVALID');
  }
  if (payload.iss !== env.SUPABASE_JWT_ISSUER) {
    throw new SupabaseAuthError('Invalid token issuer', 401, 'AUTH_INVALID');
  }
  if (!audienceMatches(payload.aud)) {
    throw new SupabaseAuthError('Invalid token audience', 401, 'AUTH_INVALID');
  }
  if (payload.role === 'service_role') {
    throw new SupabaseAuthError('Service role tokens cannot authenticate as users', 401, 'AUTH_INVALID');
  }
}

function verifyHmac(decoded: DecodedJwt): void {
  const secret = env.SUPABASE_JWT_SECRET;
  if (!secret) throw new SupabaseAuthError('Supabase JWT secret is not configured', 503, 'AUTH_NOT_CONFIGURED', true);
  const expected = createHmac('sha256', secret).update(decoded.signingInput, 'utf8').digest();
  if (expected.length !== decoded.signature.length || !timingSafeEqual(expected, decoded.signature)) {
    throw new SupabaseAuthError('Invalid token signature', 401, 'AUTH_INVALID');
  }
}

async function loadJwks(forceRefresh = false): Promise<JwkRecord[]> {
  const url = env.SUPABASE_JWKS_URL;
  const now = Date.now();
  if (!forceRefresh && jwksCache && jwksCache.url === url && jwksCache.expiresAt > now) {
    return jwksCache.keys;
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
  } catch (_e) {
    throw new SupabaseAuthError('Unable to fetch Supabase signing keys', 503, 'AUTH_UPSTREAM_UNAVAILABLE', true);
  }
  if (!response.ok) {
    throw new SupabaseAuthError('Unable to fetch Supabase signing keys', 503, 'AUTH_UPSTREAM_UNAVAILABLE', true);
  }
  const body = await response.json() as { keys?: JwkRecord[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache = { url, keys, expiresAt: now + JWKS_CACHE_MS };
  return keys;
}

async function verifyAsymmetric(decoded: DecodedJwt): Promise<void> {
  const alg = String(decoded.header.alg || '');
  const kid = typeof decoded.header.kid === 'string' ? decoded.header.kid : '';
  if (!['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'].includes(alg)) {
    throw new SupabaseAuthError('Unsupported token algorithm', 401, 'AUTH_INVALID');
  }
  let keys = await loadJwks();
  let jwk = keys.find((key) => (!kid || key.kid === kid) && (!key.alg || key.alg === alg));
  if (!jwk && kid) {
    keys = await loadJwks(true);
    jwk = keys.find((key) => key.kid === kid && (!key.alg || key.alg === alg));
  }
  if (!jwk) throw new SupabaseAuthError('Supabase signing key not found', 401, 'AUTH_INVALID');
  let publicKey;
  try {
    publicKey = createPublicKey({ key: jwk as never, format: 'jwk' });
  } catch (_e) {
    throw new SupabaseAuthError('Supabase signing key is invalid', 401, 'AUTH_INVALID');
  }
  const algorithm = alg.startsWith('ES') ? 'sha256' : `sha${alg.slice(2)}`;
  const keyOptions = alg.startsWith('ES')
    ? { key: publicKey, dsaEncoding: 'ieee-p1363' as const }
    : publicKey;
  const valid = verifySignature(algorithm, Buffer.from(decoded.signingInput, 'utf8'), keyOptions, decoded.signature);
  if (!valid) throw new SupabaseAuthError('Invalid token signature', 401, 'AUTH_INVALID');
}

export async function verifySupabaseJwt(token: string): Promise<SupabaseJwtPayload> {
  const decoded = decodeJwt(token);
  const alg = String(decoded.header.alg || '');
  if (alg === 'HS256') {
    verifyHmac(decoded);
  } else if (alg === 'none') {
    throw new SupabaseAuthError('Unsigned tokens are not accepted', 401, 'AUTH_INVALID');
  } else {
    await verifyAsymmetric(decoded);
  }
  validateClaims(decoded.payload);
  return decoded.payload;
}

async function authRequest(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const key = anonKey();
  if (!key) throw new SupabaseAuthError('Supabase Auth is not configured', 503, 'AUTH_NOT_CONFIGURED');
  let response: Response;
  try {
    response = await fetch(`${supabaseAuthUrl()}${path}`, {
      ...init,
      headers: {
        apikey: key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (_e) {
    throw new SupabaseAuthError('Authentication provider is unavailable', 503, 'AUTH_UPSTREAM_UNAVAILABLE', true);
  }
  let body: Record<string, unknown> = {};
  try {
    body = await response.json() as Record<string, unknown>;
  } catch (_e) {
    body = {};
  }
  if (response.ok) return body;
  if (response.status === 429) {
    throw new SupabaseAuthError('Too many authentication attempts', 429, 'AUTH_RATE_LIMITED', true);
  }
  if (response.status >= 500) {
    throw new SupabaseAuthError('Authentication provider is unavailable', 503, 'AUTH_UPSTREAM_UNAVAILABLE', true);
  }
  const message = typeof body.msg === 'string'
    ? body.msg
    : typeof body.error_description === 'string'
      ? body.error_description
      : typeof body.error === 'string'
        ? body.error
        : 'Invalid email or password';
  throw new SupabaseAuthError(message, 401, 'AUTH_INVALID');
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSession(body: Record<string, unknown>): SupabaseSession {
  const accessToken = stringValue(body.access_token);
  const refreshToken = stringValue(body.refresh_token);
  if (!accessToken) throw new SupabaseAuthError('Authentication response did not include an access token', 503, 'AUTH_UPSTREAM_UNAVAILABLE', true);
  const user = body.user && typeof body.user === 'object' ? body.user as Record<string, unknown> : {};
  const appMetadata = user.app_metadata && typeof user.app_metadata === 'object' ? user.app_metadata as Record<string, unknown> : {};
  const userMetadata = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata as Record<string, unknown> : {};
  const email = stringValue(user.email).toLowerCase();
  const owner = email.length > 0 && env.OWNER_EMAILS.includes(email);
  return {
    accessToken,
    refreshToken,
    expiresIn: Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600,
    tokenType: stringValue(body.token_type) || 'bearer',
    userId: stringValue(user.id),
    email,
    workspaceId: stringValue(appMetadata.workspace_id) || stringValue(userMetadata.workspace_id) || 'default-workspace',
    role: owner ? 'owner_admin' : 'normal_user',
  };
}

export async function signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
  const body = await authRequest('/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return normalizeSession(body);
}

export async function refreshSession(refreshToken: string): Promise<SupabaseSession> {
  const body = await authRequest('/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return normalizeSession(body);
}

export async function revokeSession(accessToken: string): Promise<void> {
  const key = anonKey();
  if (!key) throw new SupabaseAuthError('Supabase Auth is not configured', 503, 'AUTH_NOT_CONFIGURED');
  let response: Response;
  try {
    response = await fetch(`${supabaseAuthUrl()}/logout`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(10000),
    });
  } catch (_e) {
    throw new SupabaseAuthError('Authentication provider is unavailable', 503, 'AUTH_UPSTREAM_UNAVAILABLE', true);
  }
  if (response.ok || response.status === 401 || response.status === 403) return;
  if (response.status >= 500) {
    throw new SupabaseAuthError('Authentication provider is unavailable', 503, 'AUTH_UPSTREAM_UNAVAILABLE', true);
  }
  throw new SupabaseAuthError('Logout failed', 401, 'AUTH_INVALID');
}
