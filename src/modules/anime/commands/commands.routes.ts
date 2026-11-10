import type { FastifyInstance } from 'fastify';
import { extractUserId, requireProjectRole } from '../auth/project-guard';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { CommandIdParamsSchema, CreateCommandBodySchema } from './commands.schema';
import { getAnimeCommandForUser, submitAnimeCommand } from './commands.service';
import { enforceTenantQuota } from '../quota/quota.guard';

export async function registerAnimeCommandsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/commands', { schema: { body: CreateCommandBodySchema }, preHandler: [app.authenticate, requireProjectRole(['owner', 'admin', 'editor']), enforceTenantQuota(1)] }, async (request, reply) => {
    const userId = extractUserId(request);
    if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth missing' });
    const rawKey = request.headers['idempotency-key'] as string;
    const result = await submitAnimeCommand({ idempotencyKey: rawKey, userId, requestId: (request as any).anime?.request_id, body: request.body as any });
    return reply.status(202).send({ data: result, meta: { request_id: (request as any).anime?.request_id } });
  });

  app.get('/v1/anime/commands/:id', { schema: { params: CommandIdParamsSchema }, preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = extractUserId(request);
    if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth missing' });
    const command = await getAnimeCommandForUser((request.params as any).id, userId);
    void reply.status(200);
    return { data: command };
  });
}
