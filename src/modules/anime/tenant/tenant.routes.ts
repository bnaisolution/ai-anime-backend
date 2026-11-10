import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import * as svc from './tenant.service';

const CreateTenantBody = Type.Object({
  name: Type.String({ minLength: 2, maxLength: 100 }),
  slug: Type.Optional(Type.String({ minLength: 3, maxLength: 64 })),
  plan: Type.Optional(Type.String({ maxLength: 40 })),
});

const TenantParams = Type.Object({ id: Type.String({ format: 'uuid' }) });

function userId(request: any): string {
  const value = request.authContext?.userId;
  if (typeof value !== 'string' || !value.trim()) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Authentication required.' });
  }
  return value;
}

export async function registerAnimeTenantRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/tenants', { preHandler: [app.authenticate] }, async (request: any) => {
    const data = await svc.listTenants(userId(request));
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/tenants/current', { preHandler: [app.authenticate] }, async (request: any) => {
    const resolved = await svc.resolveRequestTenant(request);
    return {
      data: {
        id: resolved.tenant.id,
        name: resolved.tenant.name,
        slug: resolved.tenant.slug,
        status: resolved.tenant.status,
        plan: resolved.tenant.plan,
        is_platform_managed: resolved.tenant.is_platform_managed,
        role: resolved.membership.role,
        is_default: resolved.membership.is_default,
      },
      meta: { request_id: request.anime?.request_id },
    };
  });

  app.post('/v1/anime/tenants', { schema: { body: CreateTenantBody }, preHandler: [app.authenticate] }, async (request: any, reply: any) => {
    const data = await svc.createTenant(userId(request), request.body);
    void reply.status(201);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/tenants/:id/default', { schema: { params: TenantParams }, preHandler: [app.authenticate] }, async (request: any) => {
    await svc.setDefaultTenant(userId(request), request.params.id);
    return { data: { ok: true, tenant_id: request.params.id }, meta: { request_id: request.anime?.request_id } };
  });
}
