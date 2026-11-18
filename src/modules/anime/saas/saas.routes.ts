import type { FastifyInstance } from 'fastify';
import { flags } from '../../../config/flags';
import {
  assignPlan,
  getOnboarding,
  getSubscription,
  getUsageSummary,
  listPlans,
  saveOnboarding,
} from './saas.service';

export async function registerAnimeSaasRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/saas/plans', { preHandler: [app.authenticate] }, async (_request, reply) => {
    const plans = await listPlans();
    return reply.send({ data: { plans, billing_enabled: flags.saasBilling } });
  });

  app.get('/v1/anime/saas/subscription', { preHandler: [app.authenticate] }, async (request, reply) => {
    const subscription = await getSubscription(request.authContext.userId);
    return reply.send({ data: subscription });
  });

  app.get('/v1/anime/saas/usage', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = (request.query as Record<string, unknown>) || {};
    const days = query.days != null ? Math.min(365, Math.max(1, Number(query.days) || 30)) : 30;
    const usage = await getUsageSummary(request.authContext.userId, days);
    return reply.send({ data: usage });
  });

  app.get('/v1/anime/saas/onboarding', { preHandler: [app.authenticate] }, async (request, reply) => {
    const state = await getOnboarding(request.authContext.userId);
    return reply.send({ data: state });
  });

  app.patch('/v1/anime/saas/onboarding', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = (request.body as Record<string, unknown>) || {};
    const steps = (body.steps && typeof body.steps === 'object')
      ? body.steps as Record<string, unknown>
      : body;
    const state = await saveOnboarding(request.authContext.userId, steps);
    return reply.send({ data: state });
  });

  app.post('/v1/anime/saas/subscription', { preHandler: [app.authenticate, app.requireOwner] }, async (request, reply) => {
    if (!flags.saasBilling) {
      return reply.code(503).send({
        status: 'failed',
        errors: [{ category: 'BILLING_DISABLED', message: 'SaaS billing is disabled on this deployment.' }],
      });
    }
    const body = (request.body as Record<string, unknown>) || {};
    const userId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
    const planKey = typeof body.plan_key === 'string' ? body.plan_key.trim() : '';
    if (!userId || !planKey) {
      return reply.code(400).send({
        status: 'failed',
        errors: [{ category: 'INVALID_INPUT', message: 'user_id and plan_key are required' }],
      });
    }
    const subscription = await assignPlan(userId, planKey, 'manual');
    if (!subscription) {
      return reply.code(422).send({
        status: 'failed',
        errors: [{ category: 'PLAN_INVALID', message: 'Unknown plan or subscription store unavailable.' }],
      });
    }
    return reply.send({ data: subscription });
  });
}
