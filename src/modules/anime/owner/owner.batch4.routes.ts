import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { assertPlatformActionAllowed, getPlatformManagedStatus } from '../platform/platform.service';
import { getQuotaStatus } from '../quota/quota.service';
import { getReplicationAdapter } from '../replication/replication.service';
import { listTenants, resolveRequestedTenantId } from '../tenant/tenant.service';

const FailoverBody = Type.Object({
  confirm: Type.Boolean(),
  reason: Type.Optional(Type.String({ maxLength: 240 })),
});

const PlatformActionBody = Type.Object({
  confirm: Type.Boolean(),
  reason: Type.Optional(Type.String({ maxLength: 240 })),
});

function requireOwner(request: any): string {
  const auth = request.authContext;
  if (!auth || auth.isServiceIdentity === true) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Owner authentication required.' });
  }
  if (auth.role !== 'owner_admin') {
    throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Owner Admin role required.' });
  }
  return String(auth.userId || '');
}

export async function registerAnimeOwnerBatch4Routes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/owner/platform-managed/status', { preHandler: [app.authenticate] }, async (request: any) => {
    requireOwner(request);
    return { data: getPlatformManagedStatus(), meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/owner/platform-managed/activate', { schema: { body: PlatformActionBody }, preHandler: [app.authenticate] }, async (request: any) => {
    requireOwner(request);
    assertPlatformActionAllowed({
      mode: 'platform_managed',
      action: 'activation',
      confirmed: request.body.confirm,
    });
    throw new AnimeError({
      code: AnimeErrorCode.PLATFORM_MANAGED_DISABLED,
      message: 'Platform-Managed activation is not implemented for production use.',
    });
  });

  app.get('/v1/anime/owner/replication/status', { preHandler: [app.authenticate] }, async (request: any) => {
    requireOwner(request);
    const data = await getReplicationAdapter().status();
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/owner/replication/failover', { schema: { body: FailoverBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const ownerId = requireOwner(request);
    const data = await getReplicationAdapter().failover({ confirmed: request.body.confirm, requestedBy: ownerId });
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/owner/quota', { preHandler: [app.authenticate] }, async (request: any) => {
    const ownerId = requireOwner(request);
    const tenantId = resolveRequestedTenantId(request);
    const data = await getQuotaStatus(ownerId, tenantId);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/owner/tenants', { preHandler: [app.authenticate] }, async (request: any) => {
    const ownerId = requireOwner(request);
    const data = await listTenants(ownerId);
    return { data, meta: { request_id: request.anime?.request_id } };
  });
}
