import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireProjectRole } from '../../anime/auth/project-guard';
import { clearDirectorConversation } from './director.conversation';
import { executeDirectorAction, runDirectorChat, type DirectorChatInput } from './director.service';
import { CAPABILITY_VERSION, listDirectorCapabilities, rolesForIntent } from './director.capabilities';
import { listDirectorAudit } from './director.audit';
import { deleteDirectorAttachment, saveDirectorAttachment } from './director.attachments';
import { buildDirectorReadiness } from './director.readiness';
import { buildDirectorTimeline } from './director.timeline';
import { buildDirectorPlan } from './director.plan';
import { incrementCounter, setGauge } from '../../anime/observability/metrics';

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
    SETUP_REQUIRED: 422,
    BYOD_REQUIRED: 422,
    BYOD_FAILED: 502,
    QUOTA_EXCEEDED: 429,
  };
  const statusCode = status[code] || 500;
  const missing = (error as { missing?: unknown })?.missing;
  return reply.code(statusCode).send({
    status: 'failed',
    errors: [{
      category: code,
      message: statusCode === 500 ? 'AI Director request failed' : message,
      ...(Array.isArray(missing) ? { missing } : {}),
    }],
  });
}

function projectRole(request: unknown): string {
  return String((request as { anime?: { role?: unknown } })?.anime?.role || 'viewer');
}

export default async function directorRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/director/capabilities', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    return reply.send({
      data: {
        version: CAPABILITY_VERSION,
        capabilities: listDirectorCapabilities().map((capability) => ({
          ...capability,
          roles: rolesForIntent(capability.key),
        })),
      },
      meta: { request_id: (request as any).anime?.request_id || null },
    });
  });

  fastify.get('/director/readiness', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const query = (request.query as Record<string, unknown>) || {};
    const projectId = typeof query.project_id === 'string' ? query.project_id.trim() : '';
    if (projectId) {
      await requireProjectRole(
        ['owner', 'admin', 'editor', 'reviewer', 'viewer'],
        { bodyProjectId: true }
      )(request, reply);
      if (reply.sent) return;
    }
    const readiness = await buildDirectorReadiness(fastify, request.authContext, projectId || null);
    setGauge('ai_director_readiness_overall', readiness.overall === 'ready' ? 1 : 0, { state: readiness.overall });
    incrementCounter('ai_director_readiness_checks_total', { overall: readiness.overall });
    return reply.send({
      data: readiness,
      meta: { request_id: (request as any).anime?.request_id || null },
    });
  });

  fastify.get('/director/timeline', {
    preHandler: [
      fastify.authenticate,
      requireProjectRole(['owner', 'admin', 'editor', 'reviewer', 'viewer'], { bodyProjectId: true }),
    ],
  }, async (request, reply) => {
    const query = (request.query as Record<string, unknown>) || {};
    const projectId = typeof query.project_id === 'string' ? query.project_id.trim() : '';
    if (!projectId) {
      return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'project_id is required' }] });
    }
    const timeline = await buildDirectorTimeline(fastify, request.authContext, {
      projectId,
      commandId: typeof query.command_id === 'string' ? query.command_id : null,
      seasonNo: query.season_no != null ? Number(query.season_no) : null,
      episodeNo: query.episode_no != null ? Number(query.episode_no) : null,
    });
    incrementCounter('ai_director_timeline_requests_total', { status: timeline.command_status || 'none' });
    return reply.send({ data: timeline });
  });

  fastify.post('/director/plan', {
    preHandler: [
      fastify.authenticate,
      requireProjectRole(['owner', 'admin', 'editor', 'reviewer'], { bodyProjectId: true }),
    ],
  }, async (request, reply) => {
    const body = (request.body as Record<string, unknown>) || {};
    const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
    if (!projectId) {
      return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'project_id is required' }] });
    }
    const rawSteps = Array.isArray(body.steps) ? body.steps : null;
    const steps = rawSteps
      ? rawSteps
        .filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === 'object')
        .map((step) => ({
          intent: String(step.intent || ''),
          season_no: step.season_no != null ? Number(step.season_no) : null,
          episode_no: step.episode_no != null ? Number(step.episode_no) : null,
          payload: (step.payload && typeof step.payload === 'object') ? step.payload as Record<string, unknown> : {},
        }))
      : null;
    const plan = await buildDirectorPlan(fastify, request.authContext, projectRole(request), {
      projectId,
      goal: typeof body.goal === 'string' ? body.goal : null,
      steps,
    });
    incrementCounter('ai_director_plans_total', {
      overall: plan.overall,
      ready: String(plan.steps.filter((step) => step.ready).length),
    });
    return reply.send({ data: plan });
  });

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
        attachmentIds: Array.isArray(body.attachment_ids)
          ? body.attachment_ids.map((id) => String(id)).filter(Boolean)
          : null,
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

  fastify.post('/director/attachments', {
    preHandler: [fastify.authenticate, requireProjectRole(['owner', 'admin', 'editor'], { bodyProjectId: true })],
  }, async (request, reply) => {
    const body = (request.body as Record<string, unknown>) || {};
    const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
    if (!projectId) {
      return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'project_id is required' }] });
    }
    try {
      const attachment = await saveDirectorAttachment({
        userId: request.authContext.userId,
        projectId,
        conversationId: typeof body.conversation_id === 'string' ? body.conversation_id : null,
        filename: String(body.filename || 'attachment'),
        mimeType: String(body.mime_type || 'application/octet-stream'),
        dataBase64: String(body.data_base64 || ''),
      });
      return reply.code(201).send({ data: attachment });
    } catch (error) {
      return errorReply(reply, error);
    }
  });

  fastify.delete('/director/attachments/:id', {
    preHandler: [fastify.authenticate, requireProjectRole(['owner', 'admin', 'editor'], { bodyProjectId: true })],
  }, async (request, reply) => {
    const params = (request.params as Record<string, unknown>) || {};
    const query = (request.query as Record<string, unknown>) || {};
    const projectId = typeof query.project_id === 'string' ? query.project_id.trim() : '';
    if (!projectId) {
      return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'project_id is required' }] });
    }
    const ok = await deleteDirectorAttachment(request.authContext.userId, projectId, String(params.id || ''));
    if (!ok) return reply.code(404).send({ status: 'failed', errors: [{ category: 'ATTACHMENT_NOT_FOUND', message: 'Attachment not found.' }] });
    return reply.send({ data: { deleted: true } });
  });

  fastify.get('/director/audit', {
    preHandler: [
      fastify.authenticate,
      requireProjectRole(['owner', 'admin', 'editor', 'reviewer', 'viewer'], { bodyProjectId: true }),
    ],
  }, async (request, reply) => {
    const query = (request.query as Record<string, unknown>) || {};
    const projectId = typeof query.project_id === 'string' ? query.project_id.trim() : '';
    if (!projectId) {
      return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'project_id is required' }] });
    }
    const entries = await listDirectorAudit({
      userId: request.authContext.userId,
      projectId,
      limit: query.limit != null ? Number(query.limit) : 25,
    });
    return reply.send({ data: { entries, count: entries.length } });
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
