import type { FastifyInstance } from 'fastify';
import { resolveCpuTarget, testCpuTarget, cpuTargetBadge } from './cpuDispatch.service';
import { incrementCounter } from '../observability/metrics';

export async function registerAnimeCpuDispatchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/infrastructure/cpu/target', { preHandler: [app.authenticate] }, async (request, reply) => {
    const target = await resolveCpuTarget(request.authContext.userId);
    return reply.send({
      data: {
        kind: target.kind,
        badge: cpuTargetBadge(target),
        worker_url: target.workerUrl,
        repository: target.repository,
        workflow: target.workflow,
        ref: target.ref,
        has_token: target.hasToken,
      },
    });
  });

  app.post('/v1/anime/infrastructure/cpu/test', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await testCpuTarget(request.authContext.userId);
    incrementCounter('anime_cpu_target_tests_total', { kind: result.kind, ok: String(result.ok) });
    return reply.code(result.ok ? 200 : 422).send({ data: result });
  });
}
