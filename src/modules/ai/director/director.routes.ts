import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireProjectRole } from '../../anime/auth/project-guard';
import { clearDirectorConversation } from './director.conversation';
import { executeDirectorAction, runDirectorChat, type DirectorChatInput } from './director.service';

function errorReply(reply: FastifyReply, error: unknown) {
  const code = String((error as { code?: unknown })?.code || 'INTERNAL');
  const message = error instanceof Error ? error.message : 'AI Director request failed';
  const status: Record<string, number> = {
    INVALID_INPUT: 400,
    ACTION_INVALID: 400,
    ACTION_NOT_ALLOWED: 400,
    UNSUPPORTED_ACTION_INTENT: 400,
    ACTION_PROJECT_MISMATCH: 403,
    ACTION_FORBIDDEN: 403,
    PROJECT_NOT_FOUND: 404,
    ACTION_EXPIRED: 410,
    TARGET_CONFLICT: 409,
    CONTEXT_STALE: 409,
    BYOD_REQUIRED: 422,
    BYOD_FAILED: 502,
    QUOTA_EXCEEDED: 429,
  };
  const statusCode = status[code] || 500;
  return reply.code(statusCode).send({
    status: 'failed',
    errors: [{ category: code, message: statusCode === 500 ? 'AI Director request failed' : message }],
  });
}

function projectRole(request: unknown): string {
  return String((request as { anime?: { role?: unknown } })?.anime?.role || 'viewer');
}

export default async function directorRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/director/chat', {
    preHandler: [fastify.authenticate, requireProjectRole(['owner', 'admin', 'editor', 'reviewer', 'viewer'], { bodyProjectId: true })],
  }, async (request, reply) => {
    const body = (request.body as Record<string, unknown>) || {};
    const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
    if (!projectId) return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'project_id is required' }] });
    const requestedAction = body.requested_action && typeof body.requested_action === 'object'
      ? body.requested_action as DirectorChatInput['requestedAction']
      : null;
    try {
      const result = await runDirectorChat(fastify, request.authContext, projectRole(request), {
        message: String(body.message || ''),
        projectId,
        conversationId: typeof body.conversation_id === 'string' ? body.conversation_id : null,
        currentScreen: typeof body.current_screen === 'string' ? body.current_screen : null,
        explicitSeasonNo: body.season_no != null ? Number(body.season_no) : null,
        explicitEpisodeNo: body.episode_no != null ? Number(body.episode_no) : null,
        explicitTargetDurationSec: body.target_duration_sec != null ? Number(body.target_duration_sec) : null,
        requestedAction,
      });
      return reply.send(result);
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  fastify.post('/director/actions/execute', {
    preHandler: [fastify.authenticate, requireProjectRole(['owner', 'admin', 'editor'], { bodyProjectId: true })],
  }, async (request, reply) => {
    const body = (request.body as Record<string, unknown>) || {};
    const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
    const actionId = typeof body.action_id === 'string' ? body.action_id.trim() : '';
    if (!projectId || !actionId) {
      return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'project_id and action_id are required' }] });
    }
    try {
      const result = await executeDirectorAction(fastify, request.authContext, {
        actionId,
        projectId,
        idempotencyKey: (request.headers['idempotency-key'] as string) || null,
        requestId: (request as any).anime?.request_id || null,
      });
      return reply.send({ data: result, meta: { request_id: (request as any).anime?.request_id } });
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  fastify.post('/director/conversation/clear', {
    preHandler: [fastify.authenticate, requireProjectRole(['owner', 'admin', 'editor'], { bodyProjectId: true })],
  }, async (request, reply) => {
    const body = (request.body as Record<string, unknown>) || {};
    const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
    if (!projectId) return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'project_id is required' }] });
    await clearDirectorConversation(fastify, request.authContext.userId, projectId);
    return reply.send({ status: 'completed' });
  });
}
