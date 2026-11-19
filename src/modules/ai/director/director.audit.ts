import crypto from 'crypto';
import { animeSupabase } from '../../anime/db/anime.supabase';
import { redactSecrets } from '../../../security/permissionEngine';
import { directorActionRisk } from './director.capabilities';

export type DirectorAuditStatus = 'proposed' | 'executed' | 'failed' | 'blocked';

export interface DirectorAuditInput {
  userId: string;
  projectId: string;
  conversationId?: string | null;
  actionId: string;
  intent: string;
  status: DirectorAuditStatus;
  commandId?: string | null;
  requestId?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown> | null;
}

function isMissingRelation(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code || '');
  const message = String((error as { message?: unknown })?.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(message);
}

function compactPayload(payload: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  let safe: Record<string, unknown>;
  try {
    safe = redactSecrets(payload) as Record<string, unknown>;
  } catch {
    safe = {};
  }
  const text = JSON.stringify(safe);
  if (text.length <= 4_000) return safe;
  return { truncated: true, preview: text.slice(0, 4_000) };
}

export async function recordDirectorAudit(input: DirectorAuditInput): Promise<void> {
  if (!input.userId || !input.projectId || !input.actionId) return;
  try {
    const { error } = await animeSupabase.from('director_action_audit').insert({
      id: crypto.randomUUID(),
      user_id: input.userId,
      project_id: input.projectId,
      conversation_id: input.conversationId || null,
      action_id: input.actionId,
      intent: input.intent,
      risk: directorActionRisk(input.intent) || 'unknown',
      status: input.status,
      command_id: input.commandId || null,
      request_id: input.requestId || null,
      reason: input.reason ? String(input.reason).slice(0, 1_000) : null,
      payload: compactPayload(input.payload),
    });
    if (error && !isMissingRelation(error)) {
      /* Audit is best-effort; never block a Director action on audit storage. */
    }
  } catch {
    /* Audit is best-effort. */
  }
}

export async function listDirectorAudit(input: {
  userId: string;
  projectId: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const limit = Math.min(Math.max(input.limit || 25, 1), 100);
  try {
    const { data, error } = await animeSupabase
      .from('director_action_audit')
      .select('id, action_id, intent, risk, status, command_id, request_id, reason, payload, created_at')
      .eq('user_id', input.userId)
      .eq('project_id', input.projectId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      if (isMissingRelation(error)) return [];
      return [];
    }
    return (data || []) as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}
