import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { assertPlatformActionAllowed, getPlatformManagedStatus } from '../platform/platform.service';
import { getQuotaStatus } from '../quota/quota.service';
import { getReplicationAdapter } from '../replication/replication.service';
import { listTenants, resolveRequestedTenantId } from '../tenant/tenant.service';
import { listOwnerTenantDatabaseAudit, listOwnerTenantDatabases } from '../tenant/tenantDatabase.service';
import { creditWallet, getWalletSummary, listWalletLedger } from '../platform/wallet.service';

const FailoverBody = Type.Object({
  confirm: Type.Boolean(),
  reason: Type.Optional(Type.String({ maxLength: 240 })),
});

const PlatformActionBody = Type.Object({
  confirm: Type.Boolean(),
  reason: Type.Optional(Type.String({ maxLength: 240 })),
});

const WalletCreditBody = Type.Object({
  amount: Type.Number({ minimum: 0.000001, maximum: 1000000 }),
  reason: Type.String({ minLength: 2, maxLength: 240 }),
  idempotency_key: Type.Optional(Type.String({ maxLength: 128 })),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
const TenantParams = Type.Object({ tenantId: Type.String({ format: 'uuid' }) });
const AuditQuery = Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) });

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

  app.get('/v1/anime/owner/tenant-databases', { preHandler: [app.authenticate] }, async (request: any) => {
    requireOwner(request);
    const data = await listOwnerTenantDatabases();
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/owner/tenant-databases/:tenantId/audit', { schema: { params: TenantParams, querystring: AuditQuery }, preHandler: [app.authenticate] }, async (request: any) => {
    requireOwner(request);
    const data = await listOwnerTenantDatabaseAudit(request.params.tenantId, request.query.limit);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/owner/tenants/:tenantId/wallet', { schema: { params: TenantParams }, preHandler: [app.authenticate] }, async (request: any) => {
    requireOwner(request);
    const data = await getWalletSummary(request.params.tenantId);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/owner/tenants/:tenantId/wallet/ledger', { schema: { params: TenantParams, querystring: AuditQuery }, preHandler: [app.authenticate] }, async (request: any) => {
    requireOwner(request);
    const data = await listWalletLedger(request.params.tenantId, request.query.limit);
    return { data, meta: { request_id: request.anime?.request_id } };
  });

  app.post('/v1/anime/owner/tenants/:tenantId/wallet/credit', { schema: { params: TenantParams, body: WalletCreditBody }, preHandler: [app.authenticate] }, async (request: any) => {
    requireOwner(request);
    if (process.env.ANIME_PLATFORM_BILLING_ENABLED !== 'true') {
      throw new AnimeError({
        code: AnimeErrorCode.PLATFORM_MANAGED_DISABLED,
        message: 'Wallet credits are disabled until platform billing is explicitly enabled.',
      });
    }
    const data = await creditWallet({
      tenantId: request.params.tenantId,
      amount: request.body.amount,
      reason: request.body.reason,
      idempotencyKey: request.body.idempotency_key ?? null,
      metadata: request.body.metadata ?? {},
    });
    return { data, meta: { request_id: request.anime?.request_id } };
  });
}
