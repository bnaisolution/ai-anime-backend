import { FastifyInstance } from 'fastify';
import { getQuotaStatus } from '../../security/executionGuard';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/dashboard', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const quotas = await getQuotaStatus(fastify, auth.userId);
    return { status: 'completed', connection_status: { backend: 'verified' }, usage_and_limits: quotas };
  });

  fastify.post('/floating-session', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const body = (request.body as any) || {};
    await fastify.writeAuditEvent({
      user_id: auth.userId, workspace_id: auth.workspaceId, event_type: 'floating_capture_session',
      resource_type: 'floating_assistant', resource_id: auth.userId,
      action: body.state || 'session_update', status: 'completed',
      details: { frames_captured: body.frames_captured || 0, retention_policy: '7_days_ephemeral' }
    });
    return { status: 'completed', capture_state: body.state || 'stopped', retention_policy_enforced: true };
  });
}
