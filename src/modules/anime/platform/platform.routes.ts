import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { selectComputeForUser } from './compute.selector';
import { assertPlatformActionAllowed, getPlatformManagedStatus } from './platform.service';

const ComputeBody = Type.Object({
  requires_gpu: Type.Optional(Type.Boolean()),
  requires_video: Type.Optional(Type.Boolean()),
  requires_audio: Type.Optional(Type.Boolean()),
  requires_llm: Type.Optional(Type.Boolean()),
  preferred_provider: Type.Optional(Type.String({ maxLength: 64 })),
  preferred_mode: Type.Optional(Type.Union([Type.Literal('byod'), Type.Literal('platform_managed')])),
});

const PlatformActionBody = Type.Object({
  mode: Type.Optional(Type.Union([Type.Literal('byod'), Type.Literal('platform_managed')])),
  confirm: Type.Optional(Type.Boolean()),
  action: Type.Optional(Type.String({ maxLength: 80 })),
});

function userId(request: any): string {
  const value = request.authContext?.userId;
  if (typeof value !== 'string' || !value.trim()) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Authentication required.' });
  }
  return value;
}

export async function registerAnimePlatformRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/platform/status', { preHandler: [app.authenticate] }, async (request: any) => {
    return { data: getPlatformManagedStatus(), meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/infrastructure/compute/select', { schema: { body: ComputeBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const data = await selectComputeForUser(userId(request), request.body);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/platform/actions', { schema: { body: PlatformActionBody }, preHandler: [app.authenticate] }, async (request: any) => {
    assertPlatformActionAllowed({
      mode: request.body.mode,
      action: request.body.action || 'action',
      confirmed: request.body.confirm,
    });
    throw new AnimeError({
      code: AnimeErrorCode.PLATFORM_MANAGED_DISABLED,
      message: 'Platform-Managed actions are not implemented for production use.',
    });
  });
}
