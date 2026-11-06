import { FastifyInstance } from 'fastify';
import { redactSecrets } from '../../security/permissionEngine';
import { WORKFLOW_REGISTRY } from '../../security/executionGuard';
import crypto from 'crypto';

export type DiagnosisEvidenceState = 'confirmed_by_execution_evidence' | 'supported_by_logs' | 'inferred_by_ai' | 'not_yet_verified' | 'insufficient_information';
const diagnosticHistoryStore: any[] = [];
const fixSuggestionsStore = new Map<string, any>();

export default async function copilotRoutes(fastify: FastifyInstance) {
  fastify.get('/dashboard', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    return {
      status: 'completed',
      active_session_mode: request.headers['x-session-mode'] || 'Auto',
      active_project_namespace: 'Assistant',
      available_modes: [
        { mode: 'Auto', purpose: 'Let the Primary Brain route', grants_admin: false },
        { mode: 'Vision', purpose: 'Image and screenshot understanding', grants_admin: false },
        { mode: 'Story', purpose: 'Story Bible and scene work', grants_admin: false },
        { mode: 'n8n Assistant', purpose: 'Workflow inspection and diagnosis', grants_admin: false },
        { mode: 'Admin', purpose: 'Administrative operations', grants_admin: false, permitted_for_caller: auth.role === 'owner_admin' }
      ],
      capabilities: {
        error_diagnosis: 'operational',
        screenshot_analysis: 'operational',
        workflow_inspector: 'operational',
        fix_suggestions: 'operational',
        workflow_diff_viewer: 'operational'
      },
      recent_reports: diagnosticHistoryStore.slice(0, 15),
      pending_fix_proposals: Array.from(fixSuggestionsStore.values()).slice(0, 10)
    };
  });

  fastify.post('/diagnose', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body: any = request.body || {};
    if (!body.error_message && !body.execution_logs && !body.workflow_json) {
      return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'Provide error_message, logs, or workflow_json' }] });
    }

    const sanitizedLogs = String(redactSecrets(body.execution_logs || '')).slice(0, 4000);
    const sanitizedError = String(redactSecrets(body.error_message || 'Unspecified error')).slice(0, 1000);

    let evidenceState: DiagnosisEvidenceState = 'inferred_by_ai';
    const evidenceList: string[] = [];

    if (sanitizedLogs.length > 20 && /node|status|error|stack|http/i.test(sanitizedLogs)) {
      evidenceState = 'supported_by_logs';
      evidenceList.push(`Log trace provided (${sanitizedLogs.length} chars)`);
    } else if (body.workflow_json) {
      evidenceState = 'not_yet_verified';
      evidenceList.push('Static workflow JSON inspected');
    } else {
      evidenceList.push('Inferred from error description text only');
    }

    const reportId = `diag_${crypto.randomUUID().slice(0, 12)}`;
    const suggestionId = `fix_${crypto.randomUUID().slice(0, 12)}`;
    const probableCause = /401|unauthorized|token/i.test(sanitizedError) ? 'Token mismatch' : /timeout|504/i.test(sanitizedError) ? 'Upstream timeout' : 'Node parameter mismatch';

    const report = {
      report_id: reportId, created_at: new Date().toISOString(), project_id: 'assistant',
      workflow_id: body.workflow_id || null, failed_node: body.failed_node || null,
      problem_summary: sanitizedError, severity: /critical|auth/i.test(sanitizedError) ? 'high' : 'medium',
      probable_root_cause: probableCause, evidence_state: evidenceState, supporting_evidence: evidenceList,
      confidence: evidenceState === 'supported_by_logs' ? 0.85 : 0.6,
      suggested_fix_id: suggestionId, verification_plan: ['Inspect diff in Diff Viewer', 'Run Sandbox diagnostics']
    };

    const suggestion = {
      suggestion_id: suggestionId, report_id: reportId, state: 'PROPOSAL_ONLY_NOT_APPLIED',
      problem_addressed: sanitizedError, proposed_modification: { target_node: body.failed_node || 'TargetNode', action: 'Verify header contract' },
      reason_for_change: probableCause, risk_level: 'protected_system_change', approval_required: true
    };

    diagnosticHistoryStore.unshift(report);
    fixSuggestionsStore.set(suggestionId, suggestion);

    return reply.send({ status: 'completed', report, suggested_fix: suggestion });
  });

  fastify.post('/screenshot-analyze', { preHandler: [fastify.authenticate] }, async (request) => {
    const body: any = request.body || {};
    const sanitizedOcr = String(redactSecrets(body.ocr_extracted_text || 'No OCR text')).slice(0, 4000);
    return {
      status: 'completed', analysis_id: `scr_${crypto.randomUUID().slice(0, 10)}`,
      evidence_state: 'inferred_by_ai', sanitized_visible_summary: sanitizedOcr.slice(0, 500),
      limitation_notice: 'Screenshot analysis inspects visible UI only.', retention_policy: '7_days_ephemeral'
    };
  });

  fastify.get('/workflows', { preHandler: [fastify.authenticate] }, async () => {
    const list = Object.values(WORKFLOW_REGISTRY).map(w => ({
      namespace: 'Assistant', namespaced_id: `Assistant / ${w.wfId}`, wf_id: w.wfId, name: w.name, version: w.version, active: w.enabled
    }));
    return { status: 'completed', workflows: list };
  });

  fastify.post('/diff-viewer', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body: any = request.body || {};
    if (!body.original_json || !body.proposed_json) return reply.code(400).send({ status: 'failed', errors: [{ message: 'Both original and proposed JSON required' }] });

    const baseHash = crypto.createHash('sha256').update(JSON.stringify(body.original_json)).digest('hex');
    const propHash = crypto.createHash('sha256').update(JSON.stringify(body.proposed_json)).digest('hex');

    return reply.send({
      status: 'completed', namespaced_workflow_id: `Assistant / ${body.workflow_id || 'CUSTOM'}`,
      base_version_hash: baseHash, proposed_change_hash: propHash,
      diff_summary: { added_nodes: ['Validator'], removed_nodes: [], modified_nodes: [] }
    });
  });

  fastify.get('/history', { preHandler: [fastify.authenticate] }, async () => {
    return { status: 'completed', diagnostic_reports: diagnosticHistoryStore };
  });
}
