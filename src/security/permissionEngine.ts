import { FastifyInstance } from 'fastify';
import { AuthContext } from '../plugins/auth';
import crypto from 'crypto';

export type RiskClassification = 'read_only' | 'low_risk_write' | 'external_side_effect' | 'protected_system_change';

export interface AuthorizationInput {
  auth: AuthContext;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  projectId?: string | null;
  risk: RiskClassification;
  requireOwner?: boolean;
  requireApprovalToken?: boolean;
  approvalToken?: string | null;
  actionPayload?: Record<string, unknown> | null; // NEW
}

export interface AuthorizationResult {
  allowed: boolean;
  httpStatus: number;
  errorCategory?: string;
  reason?: string;
  approvalRecordId?: string | null;
}

const SECRET_REGEXES = [/gsk_[A-Za-z0-9]{20,}/g,/sk-proj-[A-Za-z0-9_-]{20,}/g,/\bsk-[A-Za-z0-9]{20,}/g,/AIza[\w-]{30,}/g,/gh[pousr]_[A-Za-z0-9]{20,}/g,/xox[baprs]-[A-Za-z0-9-]{10,}/g,/Bearer\s+[A-Za-z0-9._~+\/-]{12,}=*/gi];

export function redactSecrets(input: unknown): unknown {
  if (typeof input === 'string') {
    let out = input;
    for (const re of SECRET_REGEXES) { re.lastIndex = 0; out = out.replace(re, '[REDACTED_SECRET]'); }
    return out;
  }
  if (Array.isArray(input)) return input.map(redactSecrets);
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (/(password|passwd|secret|token|api[_.-]?key|private[_.-]?key|credential)/i.test(k)) out[k] = '[REDACTED]';
      else out[k] = redactSecrets(v);
    }
    return out;
  }
  return input;
}

export async function evaluateAuthorization(fastify: FastifyInstance, input: AuthorizationInput): Promise<AuthorizationResult> {
  const { auth, action, resourceType, resourceId, projectId, risk, requireOwner, requireApprovalToken, approvalToken, actionPayload } = input;

  if (auth.isServiceIdentity && (requireOwner || risk === 'protected_system_change')) {
    return { allowed: false, httpStatus: 403, errorCategory: 'FORBIDDEN', reason: 'Service identity does not inherit Owner permissions' };
  }

  if (requireOwner && auth.role !== 'owner_admin') {
    return { allowed: false, httpStatus: 403, errorCategory: 'FORBIDDEN', reason: 'Owner Admin authorization required' };
  }

  if (projectId) {
    const { data: proj } = await fastify.supabase.from('projects').select('id, workspace_id').eq('id', projectId).eq('workspace_id', auth.workspaceId).maybeSingle();
    if (proj && proj.workspace_id !== auth.workspaceId) return { allowed: false, httpStatus: 403, errorCategory: 'FORBIDDEN', reason: 'Cross-workspace project access denied' };
  }

  if (requireApprovalToken || risk === 'protected_system_change') {
    if (!approvalToken || !approvalToken.trim()) return { allowed: false, httpStatus: 409, errorCategory: 'APPROVAL_REQUIRED', reason: `Protected action '${action}' requires an explicit SHA-256 approval_token` };

    const tokenHash = crypto.createHash('sha256').update(approvalToken.trim()).digest('hex');
    const { data: appr } = await fastify.supabase.from('approval_records').select('*').eq('token_hash', tokenHash).eq('workspace_id', auth.workspaceId).maybeSingle();
    
    if (!appr || appr.status !== 'approved') return { allowed: false, httpStatus: 409, errorCategory: 'APPROVAL_REQUIRED', reason: 'Approval token invalid or not in approved status' };
    if (appr.expires_at && new Date(appr.expires_at).getTime() <= Date.now()) return { allowed: false, httpStatus: 409, errorCategory: 'APPROVAL_REQUIRED', reason: 'Approval token has expired' };

    // GAP 5 FIX: TOCTOU Protection (Verify Payload matches)
    if (appr.action_payload && actionPayload) {
      const dbPayloadStr = JSON.stringify(appr.action_payload);
      const reqPayloadStr = JSON.stringify(actionPayload);
      if (dbPayloadStr !== reqPayloadStr) {
        return { allowed: false, httpStatus: 409, errorCategory: 'APPROVAL_REQUIRED', reason: 'TOCTOU Mismatch: Payload differs from approved payload' };
      }
    }
    return { allowed: true, httpStatus: 200, approvalRecordId: appr.id };
  }

  return { allowed: true, httpStatus: 200 };
}
