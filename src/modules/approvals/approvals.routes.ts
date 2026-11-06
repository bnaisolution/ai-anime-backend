import { FastifyInstance } from 'fastify';
import { evaluateAuthorization, redactSecrets } from '../../security/permissionEngine';
import crypto from 'crypto';

export default async function approvalsRoutes(fastify: FastifyInstance) {
  fastify.get('/list', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const { data, error } = await fastify.supabase.from('approval_records').select('*').eq('workspace_id', auth.workspaceId).order('created_at', { ascending: false }).limit(50);
    return { status: error ? 'failed' : 'completed', approvals: data || [] };
  });

  fastify.post('/request', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const auth = request.authContext;
    const body: any = request.body || {};
    if (!body.action_type || !body.resource_type || !body.resource_id) {
      return reply.code(400).send({ status: 'failed', errors: [{ message: 'action_type, resource_type, resource_id required' }] });
    }

    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const { data, error } = await fastify.supabase.from('approval_records').insert({
      workspace_id: auth.workspaceId, project_id: body.project_id || null, requested_by: auth.userId,
      action_type: body.action_type, resource_type: body.resource_type, resource_id: body.resource_id,
      status: 'pending', expires_at: expiresAt, metadata: redactSecrets({ reason: body.reason || 'Protected operation' })
    }).select().maybeSingle();

    return reply.send({ status: error ? 'failed' : 'completed', approval: data });
  });

  fastify.post('/decide', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const auth = request.authContext;
    const body: any = request.body || {};
    if (!body.approval_id || !body.decision) return reply.code(400).send({ status: 'failed', errors: [{ message: 'approval_id and decision required' }] });

    if (body.decision === 'approved') {
      const authz = await evaluateAuthorization(fastify, { auth, action: 'APPROVE_PROTECTED_CHANGE', resourceType: 'approval_record', resourceId: body.approval_id, risk: 'low_risk_write', requireOwner: true });
      if (!authz.allowed) return reply.code(authz.httpStatus).send({ status: 'failed', errors: [{ category: authz.errorCategory, message: authz.reason }] });
    }

    let rawToken: string | null = null;
    let tokenHash: string | null = null;
    if (body.decision === 'approved') {
      rawToken = `appr_tok_${crypto.randomBytes(24).toString('hex')}`;
      tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    }

    const { data, error } = await fastify.supabase.from('approval_records').update({
      status: body.decision, approved_by: auth.userId, token_hash: tokenHash, decided_at: new Date().toISOString(), decision_note: body.decision_note || null
    }).eq('id', body.approval_id).eq('workspace_id', auth.workspaceId).select().maybeSingle();

    return reply.send({ status: error ? 'failed' : 'completed', approval: data, approval_token: rawToken });
  });
}
