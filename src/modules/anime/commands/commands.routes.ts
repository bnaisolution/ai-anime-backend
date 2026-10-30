import type { FastifyInstance } from 'fastify';
import { extractUserId, requireProjectRole } from '../auth/project-guard';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { CommandIdParamsSchema, CreateCommandBodySchema } from './commands.schema';
import { getAnimeCommandForUser, submitAnimeCommand } from './commands.service';

export async function registerAnimeCommandsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/commands', { schema: { body: CreateCommandBodySchema }, preHandler: [requireProjectRole(['owner', 'admin', 'editor'])] }, async (request, reply) => {
    const userId = extractUserId(request);
    if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth missing' });
    const rawKey = (request.headers['idempotency-key'] as string) || (request as any).anime?.request_id;
    const result = await submitAnimeCommand({ idempotencyKey: rawKey, userId, requestId: (request as any).anime?.request_id, body: request.body as any });
    void reply.status(202);
    return { data: result, meta: { request_id: (request as any).anime?.request_id } };
  });

  app.get('/v1/anime/commands/:id', { schema: { params: CommandIdParamsSchema } }, async (request, reply) => {
    if (!extractUserId(request) && typeof (app as any).authenticate === 'function') {
      try { await (app as any).authenticate(request, reply); } catch (_e) {}
    }
    const userId = extractUserId(request);
    if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth missing' });
    const command = await getAnimeCommandForUser((request.params as any).id, userId);
    void reply.status(200);
    return { data: command };
  });
}
