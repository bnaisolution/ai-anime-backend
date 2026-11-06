import type { FastifyInstance } from 'fastify';
import { recordCrash, getStableVersion, checkHealth, type CrashReportInput } from './system.service.js';

export default async function systemRoutes(fastify: FastifyInstance) {
  fastify.post('/crash-report', async (request, reply) => {
    try {
      const body = request.body as CrashReportInput;
      if (!body || !body.error_type || !body.error_message) {
        reply.code(400);
        return { error: 'error_type and error_message are required' };
      }
      const record = await recordCrash(fastify, body);
      return { success: true, record_id: (record as any)?.id ?? null };
    } catch (e: any) {
      reply.code(500);
      return { error: e.message };
    }
  });

  fastify.get('/stable-version', async (_request, reply) => {
    try {
      return await getStableVersion(fastify);
    } catch (e: any) {
      reply.code(500);
      return { error: e.message };
    }
  });

  fastify.get('/health/ping', async (_request, _reply) => {
    return { pong: true, ts: new Date().toISOString() };
  });

  fastify.get('/health/detailed', async (_request, reply) => {
    try {
      const result = await checkHealth(fastify);
      if (result.status === 'unhealthy') reply.code(503);
      return result;
    } catch (e: any) {
      reply.code(500);
      return { error: e.message };
    }
  });
}
