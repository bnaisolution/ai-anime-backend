import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import * as svc from './infrastructure.service';

const ProviderTypeEnum = Type.Union([
  Type.Literal('kaggle'), Type.Literal('own_gpu'), Type.Literal('github_actions'),
  Type.Literal('groq'), Type.Literal('gemini'), Type.Literal('tts'),
  Type.Literal('ffmpeg'), Type.Literal('youtube'), Type.Literal('instagram'), Type.Literal('custom'),
]);
const CreateBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  provider_type: ProviderTypeEnum,
  config: Type.Record(Type.String(), Type.Unknown()),
  capabilities: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  is_default: Type.Optional(Type.Boolean()),
});
const UpdateBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  capabilities: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  status: Type.Optional(Type.Union([Type.Literal('active'), Type.Literal('inactive')])),
  is_default: Type.Optional(Type.Boolean()),
});
const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });

export async function registerAnimeInfrastructureRoutes(app: FastifyInstance): Promise<void> {
  const authCheck = (request: any) => {
    const userId = request.authContext?.userId;
    if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth required' });
    return userId as string;
  };

  app.get('/v1/anime/infrastructure', async (request: any) => {
    const userId = authCheck(request);
    const items = await svc.list(userId);
    return { data: items, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/infrastructure', { schema: { body: CreateBody } }, async (request: any, reply: any) => {
    const userId = authCheck(request);
    const dto = await svc.create(userId, { ...request.body, request_id: request.anime?.request_id });
    void reply.status(201);
    return { data: dto, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/infrastructure/:id', { schema: { params: IdParams } }, async (request: any) => {
    const userId = authCheck(request);
    return { data: await svc.getById(request.params.id, userId) };
  });

  app.patch('/v1/anime/infrastructure/:id', { schema: { params: IdParams, body: UpdateBody } }, async (request: any) => {
    const userId = authCheck(request);
    return { data: await svc.update(request.params.id, userId, { ...request.body, request_id: request.anime?.request_id }) };
  });

  app.delete('/v1/anime/infrastructure/:id', { schema: { params: IdParams } }, async (request: any, reply: any) => {
    const userId = authCheck(request);
    await svc.remove(request.params.id, userId, request.anime?.request_id);
    void reply.status(204); return;
  });

  app.post('/v1/anime/infrastructure/:id/set-default', { schema: { params: IdParams } }, async (request: any) => {
    const userId = authCheck(request);
    await svc.setDefault(request.params.id, userId, request.anime?.request_id);
    return { data: { ok: true } };
  });

  app.post('/v1/anime/infrastructure/:id/verify', { schema: { params: IdParams } }, async (request: any) => {
    const userId = authCheck(request);
    return { data: await svc.verify(request.params.id, userId, request.anime?.request_id) };
  });
}
