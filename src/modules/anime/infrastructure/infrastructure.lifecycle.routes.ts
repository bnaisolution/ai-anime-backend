import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import * as svc from './infrastructure.service';
import type { ProviderType } from './infrastructure.types';

const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
const RotateBody = Type.Object({ config: Type.Record(Type.String(), Type.Unknown()) });
const BindBody = Type.Object({ tenant_id: Type.String({ format: 'uuid' }) });
const ValidateBody = Type.Object({
  provider_type: Type.String(),
  config: Type.Record(Type.String(), Type.Unknown()),
});

function userId(request: any): string {
  const value = request.authContext?.userId;
  if (typeof value !== 'string' || !value.trim()) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Authentication required.' });
  }
  return value;
}

export async function registerAnimeInfrastructureLifecycleRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/infrastructure/:id/rotate', { schema: { params: IdParams, body: RotateBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const data = await svc.rotate(request.params.id, userId(request), request.body.config, request.anime?.request_id);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/infrastructure/:id/revoke', { schema: { params: IdParams }, preHandler: [app.authenticate] }, async (request: any) => {
    const data = await svc.revoke(request.params.id, userId(request), request.anime?.request_id);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/infrastructure/:id/bind', { schema: { params: IdParams, body: BindBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const data = await svc.bindToTenant(request.params.id, userId(request), request.body.tenant_id, request.anime?.request_id);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/infrastructure/:id/lifecycle', { schema: { params: IdParams }, preHandler: [app.authenticate] }, async (request: any) => {
    const data = await svc.getById(request.params.id, userId(request));
    return {
      data: {
        id: data.id,
        provider_type: data.provider_type,
        status: data.status,
        key_version: data.key_version,
        bound_tenant_id: data.bound_tenant_id,
        last_rotated_at: data.last_rotated_at,
        revoked_at: data.revoked_at,
        last_verified_at: data.last_verified_at,
        fingerprint: data.fingerprint,
      },
      meta: { request_id: request.anime?.request_id },
    };
  });

  app.post('/v1/anime/infrastructure/validate', { schema: { body: ValidateBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const result = svc.validateConfig(request.body.provider_type as ProviderType, request.body.config);
    return { data: result, meta: { request_id: request.anime?.request_id } };
  });
}
