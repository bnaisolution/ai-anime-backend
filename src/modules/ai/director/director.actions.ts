import crypto from 'crypto';
import { env } from '../../../config/env';
import { flags } from '../../../config/flags';
import { redactSecrets } from '../../../security/permissionEngine';
import { CommandIntent } from '../../anime/commands/commands.types';
import {
  CAPABILITY_VERSION,
  directorActionRisk,
  getDirectorCapability,
  isDirectorExecutableIntent,
  type DirectorActionRisk,
} from './director.capabilities';

const ACTION_TTL_SEC = 10 * 60;
const MAX_ACTION_PAYLOAD_CHARS = 12_000;
const TOKEN_PREFIX = 'act';

export type { DirectorActionRisk };

export interface RequestedDirectorAction {
  intent: string;
  payload?: Record<string, unknown>;
  season_no?: number | null;
  episode_no?: number | null;
  target_duration_sec?: number | null;
  mode?: 'QUICK' | 'SAVE' | null;
}

export interface DirectorActionPreview {
  project_id: string;
  intent: CommandIntent;
  season_no: number;
  episode_no: number;
  target_duration_sec: number;
  mode: 'QUICK' | 'SAVE' | null;
  payload: Record<string, unknown>;
}

export interface DirectorActionProposal {
  action_id: string;
  intent: CommandIntent;
  label: string;
  description: string;
  risk: DirectorActionRisk;
  requires_confirmation: boolean;
  preview: DirectorActionPreview;
  context_version: string;
  expires_at: string;
}

export interface DirectorActionTokenPayload extends DirectorActionPreview {
  v: 1;
  sub: string;
  context_version: string;
  iat: number;
  exp: number;
  nonce: string;
  cv?: string;
}

function actionSecret(): string {
  const dedicated = String(process.env.DIRECTOR_ACTION_SECRET || '').trim();
  if (dedicated) return dedicated;
  // Safe fallback: never break Director actions because a new secret is not deployed yet.
  // Phase 0 records this as a hardening item; switch to fail-closed once the secret exists.
  return String(env.JWT_SECRET);
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(unsigned: string): string {
  return crypto.createHmac('sha256', actionSecret()).update(unsigned).digest('base64url');
}

function normalizeIntent(raw: string): CommandIntent | null {
  const value = String(raw || '').trim().toUpperCase();
  return Object.values(CommandIntent).includes(value as CommandIntent) ? value as CommandIntent : null;
}

export function isMutatingDirectorIntent(intent: CommandIntent): boolean {
  return isDirectorExecutableIntent(intent);
}

export function actionRisk(intent: CommandIntent): DirectorActionRisk {
  return directorActionRisk(intent);
}

export function buildActionProposal(input: {
  userId: string;
  projectId: string;
  contextVersion: string;
  targetDurationSec: number;
  requested: RequestedDirectorAction;
  now?: number;
}): DirectorActionProposal {
  const intent = normalizeIntent(input.requested.intent);
  if (!intent) throw new Error('UNSUPPORTED_ACTION_INTENT');
  const capability = getDirectorCapability(intent);
  if (!capability) throw new Error('ACTION_NOT_ALLOWED');
  const payload = redactSecrets(input.requested.payload || {}) as Record<string, unknown>;
  const payloadText = JSON.stringify(payload);
  if (payloadText.length > MAX_ACTION_PAYLOAD_CHARS) throw new Error('ACTION_PAYLOAD_TOO_LARGE');

  const now = input.now ?? Date.now();
  const tokenPayload: DirectorActionTokenPayload = {
    v: 1,
    sub: input.userId,
    project_id: input.projectId,
    intent,
    season_no: Math.max(1, Math.round(Number(input.requested.season_no) || 1)),
    episode_no: Math.max(1, Math.round(Number(input.requested.episode_no) || 1)),
    target_duration_sec: Math.max(15, Math.round(Number(input.requested.target_duration_sec) || input.targetDurationSec)),
    mode: input.requested.mode === 'QUICK' || input.requested.mode === 'SAVE' ? input.requested.mode : null,
    payload,
    context_version: input.contextVersion,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ACTION_TTL_SEC,
    nonce: crypto.randomUUID(),
    cv: CAPABILITY_VERSION,
  };
  const encoded = base64url(JSON.stringify(tokenPayload));
  const actionId = `${TOKEN_PREFIX}.${encoded}.${sign(`${TOKEN_PREFIX}.${encoded}`)}`;
  const risk = directorActionRisk(intent);
  return {
    action_id: actionId,
    intent,
    label: capability.label,
    description: capability.description || `${intent} for Season ${tokenPayload.season_no}, Episode ${tokenPayload.episode_no}, target ${Math.round(tokenPayload.target_duration_sec / 60)} minutes.`,
    risk,
    requires_confirmation: capability.requires_confirmation,
    preview: {
      project_id: tokenPayload.project_id,
      intent,
      season_no: tokenPayload.season_no,
      episode_no: tokenPayload.episode_no,
      target_duration_sec: tokenPayload.target_duration_sec,
      mode: tokenPayload.mode,
      payload,
    },
    context_version: tokenPayload.context_version,
    expires_at: new Date(tokenPayload.exp * 1000).toISOString(),
  };
}

export function extractStructuredDirectorAction(reply: string): {
  reply: string;
  requested: RequestedDirectorAction | null;
} {
  const openTag = '<director_actions>';
  const closeTag = '</director_actions>';
  let cleaned = String(reply || '');
  let requested: RequestedDirectorAction | null = null;
  const start = cleaned.indexOf(openTag);
  if (start >= 0) {
    const end = cleaned.indexOf(closeTag, start + openTag.length);
    if (end >= 0) {
      const raw = cleaned.slice(start + openTag.length, end).trim();
      cleaned = `${cleaned.slice(0, start)}${cleaned.slice(end + closeTag.length)}`.trim();
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.intent === 'string') {
          requested = parsed as RequestedDirectorAction;
        }
      } catch {
        requested = null;
      }
    }
  }
  return { reply: cleaned, requested };
}

export function verifyDirectorActionToken(actionId: string, now = Date.now()): DirectorActionTokenPayload {
  const parts = String(actionId || '').split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) throw new Error('ACTION_INVALID');
  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(unsigned));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) throw new Error('ACTION_INVALID');
  let parsed: DirectorActionTokenPayload;
  try {
    parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as DirectorActionTokenPayload;
  } catch {
    throw new Error('ACTION_INVALID');
  }
  if (parsed.v !== 1 || !parsed.sub || !parsed.project_id || !parsed.intent) throw new Error('ACTION_INVALID');
  if (parsed.exp * 1000 <= now) throw new Error('ACTION_EXPIRED');
  if (!isDirectorExecutableIntent(parsed.intent)) throw new Error('ACTION_NOT_ALLOWED');
  return parsed;
}
