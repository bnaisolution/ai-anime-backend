import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { CommandIdParamsSchema, CreateCommandBodySchema } from './commands.schema';
import { getAnimeCommandForUser, submitAnimeCommand } from './commands.service';

function pickIdempotencyKey(headers: any): string | undefined {
  const raw = headers?.['idempotency-key'] ?? headers?.['x-idempotency-key'];
  if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : undefined;
  return typeof raw === 'string' ? raw : undefined;
}

export async function registerAnimeCommandsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/commands', {
    schema: { body: CreateCommandBodySchema },
    preHandler: [async (request: any, reply: any) => {
      const ctx = request.authContext;
      if (!ctx?.userId) {
        throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth missing' });
      }
      const body = request.body as any;
      if (body?.intent === 'CREATE_PROJECT') {
        request.anime = { ...(request.anime ?? {}), user_id: ctx.userId, project_id: body.project_id, role: 'owner' };
        return;
      }
      await requireProjectRole(['owner', 'admin', 'editor'])(request, reply);
    }],
  }, async (request: any, reply: any) => {
    const userId = request.anime?.user_id;
    if (!userId) {
      throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth missing' });
    }
    const result = await submitAnimeCommand({
      idempotencyKey: pickIdempotencyKey(request.headers),
      userId,
      requestId: request.anime?.request_id,
      body: request.body,
    });
    void reply.status(202);
    return { data: result, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/commands/:id', { schema: { params: CommandIdParamsSchema } }, async (request: any, reply: any) => {
    const userId = request.authContext?.userId;
    if (!userId) {
      throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth missing' });
    }
    const command = await getAnimeCommandForUser(request.params.id, userId);
    void reply.status(200);
    return { data: command };
  });
}
