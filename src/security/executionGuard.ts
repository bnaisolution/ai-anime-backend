import { FastifyInstance } from 'fastify';
import { AuthContext } from '../plugins/auth';
import { evaluateAuthorization, RiskClassification } from './permissionEngine';

export interface WorkflowRegistryEntry {
  wfId: string;
  name: string;
  webhookPath: string;
  version: string;
  enabled: boolean;
  risk: RiskClassification;
  requiresProject: boolean;
  requiresApprovalForWrite: boolean;
  supportedIntents: string[];
}

export const WORKFLOW_REGISTRY: Record<string, WorkflowRegistryEntry> = {
  'WF-00': { wfId: 'WF-00', name: 'AI Gateway & Router', webhookPath: '/webhook/wf00-gateway', version: '1.8', enabled: true, risk: 'low_risk_write', requiresProject: false, requiresApprovalForWrite: false, supportedIntents: ['CHAT','ANALYZE_WORKFLOW','GENERATE_WORKFLOW','UPDATE_WORKFLOW','VALIDATE_WORKFLOW','RESEARCH_DOCUMENTATION','GET_PROJECT_PROGRESS','EXECUTE_TASK','SET_REMINDER','LIST_LIVE_WORKFLOWS','GET_LIVE_WORKFLOW'] },
  'WF-01': { wfId: 'WF-01', name: 'Analyzer & Debugger', webhookPath: '/webhook/wf01-analyze', version: '2.2', enabled: true, risk: 'read_only', requiresProject: false, requiresApprovalForWrite: false, supportedIntents: ['ANALYZE_WORKFLOW'] },
  'WF-02': { wfId: 'WF-02', name: 'Workflow Generator', webhookPath: '/webhook/wf02-generate', version: '2.1', enabled: true, risk: 'low_risk_write', requiresProject: false, requiresApprovalForWrite: false, supportedIntents: ['GENERATE_WORKFLOW'] },
  'WF-03': { wfId: 'WF-03', name: 'Workflow Updater', webhookPath: '/webhook/wf03-update', version: '1.1', enabled: true, risk: 'low_risk_write', requiresProject: false, requiresApprovalForWrite: false, supportedIntents: ['UPDATE_WORKFLOW'] },
  'WF-04': { wfId: 'WF-04', name: 'Workflow Validator', webhookPath: '/webhook/wf04-validate', version: '2.2', enabled: true, risk: 'read_only', requiresProject: false, requiresApprovalForWrite: false, supportedIntents: ['VALIDATE_WORKFLOW'] },
  'WF-05': { wfId: 'WF-05', name: 'Documentation Researcher', webhookPath: '/webhook/wf05-research', version: '2.3', enabled: true, risk: 'read_only', requiresProject: false, requiresApprovalForWrite: false, supportedIntents: ['RESEARCH_DOCUMENTATION'] },
  'WF-06': { wfId: 'WF-06', name: 'Project Progress Manager', webhookPath: '/webhook/wf06-progress', version: '2.1', enabled: true, risk: 'read_only', requiresProject: true, requiresApprovalForWrite: false, supportedIntents: ['GET_PROJECT_PROGRESS'] },
  'WF-07': { wfId: 'WF-07', name: 'Memory Manager', webhookPath: '/webhook/wf07-memory', version: '2.6', enabled: true, risk: 'low_risk_write', requiresProject: false, requiresApprovalForWrite: false, supportedIntents: ['MEMORY_OPERATION'] },
  'WF-08': { wfId: 'WF-08', name: 'Task & Approval Manager', webhookPath: '/webhook/wf08-task', version: '2.7', enabled: true, risk: 'low_risk_write', requiresProject: true, requiresApprovalForWrite: false, supportedIntents: ['EXECUTE_TASK'] },
  'WF-09': { wfId: 'WF-09', name: 'Connected n8n Manager', webhookPath: '/webhook/wf09-n8n', version: '1.7', enabled: true, risk: 'external_side_effect', requiresProject: false, requiresApprovalForWrite: true, supportedIntents: ['LIST_LIVE_WORKFLOWS', 'GET_LIVE_WORKFLOW'] },
  'WF-10': { wfId: 'WF-10', name: 'Notification & Reminder Manager', webhookPath: '/webhook/wf10-notify', version: '2.4', enabled: true, risk: 'external_side_effect', requiresProject: false, requiresApprovalForWrite: false, supportedIntents: ['SET_REMINDER'] }
};

export const QUOTA_LIMITS = { RPM: 30, TPM: 60000, RPD: 1000 };

interface UserQuotaWindow {
  minuteStart: number;
  minuteRequests: number;
  minuteTokens: number;
  dayStart: number;
  dayRequests: number;
}

const userQuotaWindows = new Map<string, UserQuotaWindow>();

function utcDayStart(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function currentQuotaWindow(userId: string, now: number): UserQuotaWindow {
  const dayStart = utcDayStart(now);
  const existing = userQuotaWindows.get(userId);
  if (!existing || dayStart !== existing.dayStart) {
    const fresh = { minuteStart: now, minuteRequests: 0, minuteTokens: 0, dayStart, dayRequests: 0 };
    userQuotaWindows.set(userId, fresh);
    return fresh;
  }
  if (now - existing.minuteStart >= 60_000) {
    existing.minuteStart = now;
    existing.minuteRequests = 0;
    existing.minuteTokens = 0;
  }
  return existing;
}

export function resetQuotaStateForTests(): void {
  userQuotaWindows.clear();
}

export async function checkAndRecordQuota(fastify: FastifyInstance, userId: string, estimatedTokens = 500): Promise<{ allowed: boolean; reason?: string }> {
  const now = Date.now();
  const tokens = Math.max(1, Math.ceil(estimatedTokens));
  const window = currentQuotaWindow(userId, now);

  if (window.minuteRequests + 1 > QUOTA_LIMITS.RPM) {
    return { allowed: false, reason: `RPM quota exceeded (${QUOTA_LIMITS.RPM}/min)` };
  }
  if (window.minuteTokens + tokens > QUOTA_LIMITS.TPM) {
    return { allowed: false, reason: `TPM quota exceeded (${QUOTA_LIMITS.TPM}/min)` };
  }
  if (window.dayRequests + 1 > QUOTA_LIMITS.RPD) {
    return { allowed: false, reason: `RPD daily quota exceeded (${QUOTA_LIMITS.RPD}/day)` };
  }

  window.minuteRequests += 1;
  window.minuteTokens += tokens;
  window.dayRequests += 1;

  // The in-process reservation prevents concurrent bypass. The caller records
  // the actual usage in execution_records after the provider call.
  void fastify;
  return { allowed: true };
}

export async function getQuotaStatus(fastify: FastifyInstance, userId: string) {
  const now = Date.now();
  const window = currentQuotaWindow(userId, now);
  return {
    limits: QUOTA_LIMITS,
    used: {
      rpm: window.minuteRequests,
      tpm: window.minuteTokens,
      rpd: window.dayRequests,
    },
  };
}

export async function runExecutionGuard(fastify: FastifyInstance, auth: AuthContext, intent: string, projectId: string | null | undefined, payload: Record<string, unknown>): Promise<any> {
  const normalizedIntent = (intent || '').trim().toUpperCase();
  
  let dynamicRegistry: Record<string, WorkflowRegistryEntry> = WORKFLOW_REGISTRY;
  try {
    const { data } = await fastify.supabase.from('integrations').select('config').eq('integration_type', 'workflow_registry').maybeSingle();
    if (data && data.config && typeof data.config === 'object' && Object.keys(data.config).length > 0) {
      dynamicRegistry = data.config as Record<string, WorkflowRegistryEntry>;
    }
  } catch (e) {}

  const targetEntry = Object.values(dynamicRegistry).find((w) => w.wfId !== 'WF-00' && w.supportedIntents.includes(normalizedIntent)) || (normalizedIntent === 'CHAT' ? dynamicRegistry['WF-00'] : undefined);
  
  if (!targetEntry) return { ok: false, httpStatus: 400, category: 'INVALID_INPUT', message: `Unregistered intent: ${normalizedIntent}` };
  if (!targetEntry.enabled) return { ok: false, httpStatus: 503, category: 'INTEGRATION_UNAVAILABLE', message: `Target workflow ${targetEntry.wfId} is disabled` };
  if (targetEntry.requiresProject && !projectId) return { ok: false, httpStatus: 400, category: 'INVALID_INPUT', message: `project_id is required for intent ${normalizedIntent}` };
  
  const quotaCheck = await checkAndRecordQuota(fastify, auth.userId, 800);
  if (!quotaCheck.allowed) return { ok: false, httpStatus: 429, category: 'PROVIDER_RATE_LIMIT', message: quotaCheck.reason };

  const authDecision = await evaluateAuthorization(fastify, { auth, action: `EXECUTE_${normalizedIntent}`, resourceType: 'workflow', resourceId: targetEntry.wfId, projectId: projectId || null, risk: targetEntry.risk, requireOwner: false, requireApprovalToken: false, approvalToken: (payload.approval_token as string) || null, actionPayload: payload });
  if (!authDecision.allowed) return { ok: false, httpStatus: authDecision.httpStatus, category: authDecision.errorCategory || 'FORBIDDEN', message: authDecision.reason || 'Blocked by Execution Guard' };

  return { ok: true, httpStatus: 200, targetWf: targetEntry };
}
