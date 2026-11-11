import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { selectComputeForUser, selectComputeMatrixForUser } from './compute.selector';
import { listModels, selectModel } from './modelCatalog';
import { listProviders } from './providerRegistry';
import { buildFallbackPlan } from './universalFallback';
import { assertPlatformActionAllowed, getPlatformManagedStatus } from './platform.service';
import { cancelPlatformQueueItem, getPlatformBillingSummary, getPlatformPoolStatus, listPlatformQueue, recordPlatformUsage, releasePlatformLease, reservePlatformCapacity } from './platformPool.service';
import { resolveTenant } from '../tenant/tenant.service';

const ComputeBody = Type.Object({
  requires_gpu: Type.Optional(Type.Boolean()),
  requires_video: Type.Optional(Type.Boolean()),
  requires_audio: Type.Optional(Type.Boolean()),
  requires_llm: Type.Optional(Type.Boolean()),
  preferred_provider: Type.Optional(Type.String({ maxLength: 64 })),
  preferred_mode: Type.Optional(Type.Union([Type.Literal('byod'), Type.Literal('platform_managed')])),
  tenant_id: Type.Optional(Type.String({ format: 'uuid' })),
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
const ComputeModeEnum = Type.Union([Type.Literal('byod'), Type.Literal('platform_managed'), Type.Literal('auto')]);
const ComputeMatrixBody = Type.Object({
  gpu_mode: Type.Optional(ComputeModeEnum),
  cpu_mode: Type.Optional(ComputeModeEnum),
  gpu_task: Type.Optional(ModelTaskEnum),
  cpu_task: Type.Optional(ModelTaskEnum),
  selection_mode: Type.Optional(Type.Union([Type.Literal('auto'), Type.Literal('simple'), Type.Literal('advanced')])),
  model_id: Type.Optional(Type.String({ maxLength: 128 })),
  vram_gb: Type.Optional(Type.Number({ minimum: 0 })),
  dependencies: Type.Optional(Type.Array(Type.String({ maxLength: 64 }))),
  weights: Type.Optional(Type.Array(Type.String({ maxLength: 64 }))),
  allow_paid_fallback: Type.Optional(Type.Boolean()),
  preferred_provider: Type.Optional(Type.String({ maxLength: 64 })),
  primary_provider: Type.Optional(Type.String({ maxLength: 64 })),
  secondary_provider: Type.Optional(Type.String({ maxLength: 64 })),
  checkpoint: Type.Optional(Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()])),
  tenant_id: Type.Optional(Type.String({ format: 'uuid' })),
});
const PoolResourceEnum = Type.Union([Type.Literal('gpu'), Type.Literal('cpu'), Type.Literal('llm'), Type.Literal('storage')]);
const ReservePoolBody = Type.Object({
  tenant_id: Type.String({ format: 'uuid' }),
  project_id: Type.Optional(Type.String({ format: 'uuid' })),
  resource: PoolResourceEnum,
  provider_id: Type.String({ maxLength: 80 }),
  units: Type.Number({ minimum: 0.000001 }),
  ttl_seconds: Type.Optional(Type.Integer({ minimum: 30, maximum: 86400 })),
  idempotency_key: Type.Optional(Type.String({ maxLength: 128 })),
  payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
const ReleasePoolBody = Type.Object({ tenant_id: Type.String({ format: 'uuid' }), lease_id: Type.String({ format: 'uuid' }) });
const QueueQuery = Type.Object({ tenant_id: Type.String({ format: 'uuid' }) });
const QueueParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
const UsageBody = Type.Object({
  tenant_id: Type.String({ format: 'uuid' }),
  project_id: Type.Optional(Type.String({ format: 'uuid' })),
  resource: PoolResourceEnum,
  provider_id: Type.String({ maxLength: 80 }),
  units: Type.Number({ minimum: 0 }),
  billable_units: Type.Optional(Type.Number({ minimum: 0 })),
  unit_price: Type.Optional(Type.Number({ minimum: 0 })),
  currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
  idempotency_key: Type.Optional(Type.String({ maxLength: 128 })),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
const BillingQuery = Type.Object({
  tenant_id: Type.String({ format: 'uuid' }),
  from: Type.Optional(Type.String({ format: 'date-time' })),
  to: Type.Optional(Type.String({ format: 'date-time' })),
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
    const tenantId = request.body.tenant_id ? (await resolveTenant(userId(request), request.body.tenant_id)).tenant.id : undefined;
    const data = await selectComputeForUser(userId(request), request.body, tenantId);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/platform/pool/status', { preHandler: [app.authenticate] }, async (request: any) => {
    return { data: await getPlatformPoolStatus(), meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/platform/pool/reserve', { schema: { body: ReservePoolBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const tenant = await resolveTenant(userId(request), request.body.tenant_id);
    const data = await reservePlatformCapacity({
      tenantId: tenant.tenant.id,
      projectId: request.body.project_id ?? null,
      resource: request.body.resource,
      providerId: request.body.provider_id,
      units: request.body.units,
      ttlSeconds: request.body.ttl_seconds,
      idempotencyKey: request.body.idempotency_key ?? null,
      payload: request.body.payload ?? {},
    });
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/platform/pool/release', { schema: { body: ReleasePoolBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const tenant = await resolveTenant(userId(request), request.body.tenant_id);
    return { data: await releasePlatformLease(tenant.tenant.id, request.body.lease_id), meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/platform/pool/queue', { schema: { querystring: QueueQuery }, preHandler: [app.authenticate] }, async (request: any) => {
    const tenant = await resolveTenant(userId(request), request.query.tenant_id);
    return { data: await listPlatformQueue(tenant.tenant.id), meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/platform/pool/queue/:id/cancel', { schema: { params: QueueParams, querystring: QueueQuery }, preHandler: [app.authenticate] }, async (request: any) => {
    const tenant = await resolveTenant(userId(request), request.query.tenant_id);
    return { data: await cancelPlatformQueueItem(tenant.tenant.id, request.params.id), meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/platform/usage', { schema: { body: UsageBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const tenant = await resolveTenant(userId(request), request.body.tenant_id);
    const data = await recordPlatformUsage({
      tenantId: tenant.tenant.id,
      projectId: request.body.project_id ?? null,
      resource: request.body.resource,
      providerId: request.body.provider_id,
      units: request.body.units,
      billableUnits: request.body.billable_units,
      unitPrice: request.body.unit_price,
      currency: request.body.currency,
      idempotencyKey: request.body.idempotency_key ?? null,
      metadata: request.body.metadata ?? {},
    });
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/platform/billing/summary', { schema: { querystring: BillingQuery }, preHandler: [app.authenticate] }, async (request: any) => {
    const tenant = await resolveTenant(userId(request), request.query.tenant_id);
    return { data: await getPlatformBillingSummary(tenant.tenant.id, request.query.from, request.query.to), meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/infrastructure/compute/matrix', { schema: { body: ComputeMatrixBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const tenantId = request.body.tenant_id ? (await resolveTenant(userId(request), request.body.tenant_id)).tenant.id : undefined;
    const data = await selectComputeMatrixForUser(userId(request), request.body, tenantId);
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
