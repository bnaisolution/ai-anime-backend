import type { FastifyInstance } from 'fastify';
import { recordCrash, getStableVersion, checkHealth, type CrashReportInput, type HealthCheckResult } from './system.service.js';

function sanitizeHealth(result: HealthCheckResult): HealthCheckResult {
  const checks: HealthCheckResult['checks'] = {};
  for (const [name, check] of Object.entries(result.checks)) {
    checks[name] = { status: check.status };
    if (typeof check.latency_ms === 'number') checks[name].latency_ms = check.latency_ms;
  }
  return { status: result.status, checks, timestamp: result.timestamp };
}

export default async function systemRoutes(fastify: FastifyInstance) {
  fastify.post('/crash-report', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as CrashReportInput;
    if (!body || !body.error_type || !body.error_message) {
      void reply.code(400);
      return { error: 'error_type and error_message are required' };
    }
    try {
      const record = await recordCrash(fastify, body);
      return { success: true, record_id: (record as any)?.id ?? null };
    } catch (_e) {
      void reply.code(503);
      return { error: 'CRASH_REPORT_UNAVAILABLE' };
    }
  });

  fastify.get('/stable-version', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    try {
      return await getStableVersion(fastify);
    } catch (_e) {
      void reply.code(503);
      return { error: 'STABLE_VERSION_UNAVAILABLE' };
    }
  });

  fastify.get('/health/ping', async () => {
    return { status: 'ok' };
  });

  fastify.get('/health/detailed', { preHandler: [fastify.authenticate, fastify.requireOwner] }, async (_request, reply) => {
    try {
      const result = await checkHealth(fastify);
      if (result.status === 'unhealthy') void reply.code(503);
      return sanitizeHealth(result);
    } catch (_e) {
      void reply.code(503);
      return { error: 'HEALTH_DETAILS_UNAVAILABLE' };
    }
  });
}
