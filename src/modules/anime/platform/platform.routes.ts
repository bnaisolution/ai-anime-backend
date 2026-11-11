import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { selectComputeForUser } from './compute.selector';
import { listModels, selectModel } from './modelCatalog';
import { listProviders } from './providerRegistry';
import { buildFallbackPlan } from './universalFallback';
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

const ProviderCategoryEnum = Type.Union([
  Type.Literal('ai'), Type.Literal('gpu'), Type.Literal('cpu'), Type.Literal('storage'), Type.Literal('database'),
]);
const ProviderQuery = Type.Object({ category: Type.Optional(ProviderCategoryEnum) });
const ModelTaskEnum = Type.Union([
  Type.Literal('chat'), Type.Literal('embedding'), Type.Literal('image'), Type.Literal('video'),
  Type.Literal('animation'), Type.Literal('lipsync'), Type.Literal('voice'), Type.Literal('ffmpeg'),
]);
const ModelQuery = Type.Object({ task: Type.Optional(ModelTaskEnum) });
const ModelSelectBody = Type.Object({
  mode: Type.Optional(Type.Union([Type.Literal('auto'), Type.Literal('simple'), Type.Literal('advanced')])),
  task: ModelTaskEnum,
  provider_id: Type.Optional(Type.String({ maxLength: 64 })),
  model_id: Type.Optional(Type.String({ maxLength: 128 })),
  vram_gb: Type.Optional(Type.Number({ minimum: 0 })),
  dependencies: Type.Optional(Type.Array(Type.String({ maxLength: 64 }))),
  weights: Type.Optional(Type.Array(Type.String({ maxLength: 64 }))),
  allow_paid_fallback: Type.Optional(Type.Boolean()),
  platform_managed: Type.Optional(Type.Boolean()),
});
const FallbackCandidateBody = Type.Object({
  provider_id: Type.String({ maxLength: 64 }),
  priority: Type.Optional(Type.Number()),
  available: Type.Optional(Type.Boolean()),
  healthy: Type.Optional(Type.Boolean()),
  billing: Type.Optional(Type.Union([Type.Literal('none'), Type.Literal('user'), Type.Literal('platform')])),
  supports_checkpoint: Type.Optional(Type.Boolean()),
  reason: Type.Optional(Type.String({ maxLength: 200 })),
});
const FallbackPlanBody = Type.Object({
  candidates: Type.Array(FallbackCandidateBody, { maxItems: 32 }),
  primary_provider: Type.Optional(Type.String({ maxLength: 64 })),
  secondary_provider: Type.Optional(Type.String({ maxLength: 64 })),
  mode: Type.Optional(Type.Union([Type.Literal('manual'), Type.Literal('automatic')])),
  allow_paid_fallback: Type.Optional(Type.Boolean()),
  checkpoint: Type.Optional(Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()])),
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

  app.get('/v1/anime/platform/providers', { schema: { querystring: ProviderQuery }, preHandler: [app.authenticate] }, async (request: any) => {
    return { data: listProviders(request.query.category), meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/platform/models', { schema: { querystring: ModelQuery }, preHandler: [app.authenticate] }, async (request: any) => {
    return { data: listModels(request.query.task), meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/platform/models/select', { schema: { body: ModelSelectBody }, preHandler: [app.authenticate] }, async (request: any) => {
    return { data: selectModel(request.body), meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/platform/fallback/plan', { schema: { body: FallbackPlanBody }, preHandler: [app.authenticate] }, async (request: any) => {
    return { data: buildFallbackPlan(request.body), meta: { request_id: request.anime?.request_id } };
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
