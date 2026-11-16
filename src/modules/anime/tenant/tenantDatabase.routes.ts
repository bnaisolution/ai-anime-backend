import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { getWalletSummary, listWalletLedger } from '../platform/wallet.service';
import * as dbSvc from './tenantDatabase.service';
import * as dbRepo from './tenantDatabase.repo';
import { resolveRequestTenant } from './tenant.service';

const DsnBody = Type.Object({
  dsn: Type.String({ minLength: 10, maxLength: 4096 }),
});
const ProjectListBody = Type.Object({
  project_ids: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1, maxItems: 50 }),
});
const AuditQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
});

function userId(request: any): string {
  const value = request.authContext?.userId;
  if (typeof value !== 'string' || !value.trim()) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Authentication required.' });
  }
  return value;
}

export async function registerAnimeTenantDatabaseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/tenants/me/database', { preHandler: [app.authenticate] }, async (request: any) => {
    const resolved = await resolveRequestTenant(request);
    const data = await dbSvc.getTenantDatabasePublic(resolved.tenant.id);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/tenants/me/database/test', { schema: { body: DsnBody }, preHandler: [app.authenticate] }, async (request: any) => {
    dbSvc.assertByodEnabled();
    const resolved = await resolveRequestTenant(request);
    const result = await dbSvc.testTenantDsn(request.body.dsn);
    await dbRepo.writeTenantDatabaseAudit({
      tenant_id: resolved.tenant.id,
      actor_user_id: userId(request),
      action: 'test',
      status: result.ok ? 'success' : 'failed',
      detail: { latency_ms: result.latency_ms, error: result.error },
    });
    return { data: result, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/tenants/me/database/connect', { schema: { body: DsnBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const resolved = await resolveRequestTenant(request);
    const data = await dbSvc.connectTenantDatabase({
      tenantId: resolved.tenant.id,
      userId: userId(request),
      dsn: request.body.dsn,
    });
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.delete('/v1/anime/tenants/me/database', { preHandler: [app.authenticate] }, async (request: any) => {
    const resolved = await resolveRequestTenant(request);
    const data = await dbSvc.disconnectTenantDatabase({
      tenantId: resolved.tenant.id,
      userId: userId(request),
    });
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/tenants/me/database/health', { preHandler: [app.authenticate] }, async (request: any) => {
    const resolved = await resolveRequestTenant(request);
    const data = await dbSvc.checkTenantDatabaseHealth({
      tenantId: resolved.tenant.id,
      userId: userId(request),
    });
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/tenants/me/database/provision', { preHandler: [app.authenticate] }, async (request: any) => {
    const resolved = await resolveRequestTenant(request);
    const data = await dbSvc.provisionTenantSchema(resolved.tenant.id, userId(request));
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/tenants/me/database/migrate', { schema: { body: ProjectListBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const resolved = await resolveRequestTenant(request);
    const data = await dbSvc.migrateProjectsToTenant({
      tenantId: resolved.tenant.id,
      userId: userId(request),
      projectIds: request.body.project_ids,
    });
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/tenants/me/database/rollback', { schema: { body: ProjectListBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const resolved = await resolveRequestTenant(request);
    const data = await dbSvc.rollbackProjectsToCentral({
      tenantId: resolved.tenant.id,
      userId: userId(request),
      projectIds: request.body.project_ids,
    });
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/tenants/me/wallet', { preHandler: [app.authenticate] }, async (request: any) => {
    const resolved = await resolveRequestTenant(request);
    const data = await getWalletSummary(resolved.tenant.id);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/tenants/me/wallet/ledger', { schema: { querystring: AuditQuery }, preHandler: [app.authenticate] }, async (request: any) => {
    const resolved = await resolveRequestTenant(request);
    const data = await listWalletLedger(resolved.tenant.id, request.query.limit);
    return { data, meta: { request_id: request.anime?.request_id } };
  });
}
