import { createHash } from 'node:crypto';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import * as repo from './tenant.repo';
import type { ResolvedTenant, TenantMemberRecord, TenantPublicDto, TenantRecord } from './tenant.types';

const TENANT_HEADER = 'x-tenant-id';

function tenantForbidden(message: string): AnimeError {
  return new AnimeError({ code: AnimeErrorCode.TENANT_FORBIDDEN, message });
}

function requireUserId(userId: string): string {
  const value = typeof userId === 'string' ? userId.trim() : '';
  if (!value) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Authentication required.' });
  return value;
}

function normalizeSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (slug.length >= 3) return slug;
  return `tenant-${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
}

function assertActiveTenant(tenant: TenantRecord): void {
  if (tenant.status !== 'active') throw tenantForbidden('Tenant is not active.');
}

function toPublic(tenant: TenantRecord, membership: TenantMemberRecord): TenantPublicDto {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    plan: tenant.plan,
    is_platform_managed: tenant.is_platform_managed,
    role: membership.role,
    is_default: membership.is_default,
  };
}

export async function resolveTenant(userId: string, requestedTenantId?: string | null): Promise<ResolvedTenant> {
  const uid = requireUserId(userId);
  const requested = typeof requestedTenantId === 'string' ? requestedTenantId.trim() : '';

  if (requested) {
    const membership = await repo.getMembership(uid, requested);
    if (!membership) throw tenantForbidden('Tenant access denied.');
    const tenant = await repo.getTenant(requested);
    if (!tenant) throw tenantForbidden('Tenant access denied.');
    assertActiveTenant(tenant);
    return { tenant, membership };
  }

  const memberships = await repo.listActiveMemberships(uid);
  if (memberships.length === 0) throw tenantForbidden('No active tenant membership.');
  if (memberships.length === 1) {
    const tenant = await repo.getTenant(memberships[0].tenant_id);
    if (!tenant) throw tenantForbidden('Tenant access denied.');
    assertActiveTenant(tenant);
    return { tenant, membership: memberships[0] };
  }

  const defaults = memberships.filter((membership) => membership.is_default === true);
  if (defaults.length !== 1) {
    throw new AnimeError({ code: AnimeErrorCode.TENANT_REQUIRED, message: 'Tenant selection required.' });
  }
  const tenant = await repo.getTenant(defaults[0].tenant_id);
  if (!tenant) throw tenantForbidden('Tenant access denied.');
  assertActiveTenant(tenant);
  return { tenant, membership: defaults[0] };
}

export async function assertProjectTenantAccess(userId: string, projectTenantId: string | null | undefined): Promise<ResolvedTenant | null> {
  if (!projectTenantId) return null;
  return resolveTenant(userId, projectTenantId);
}

export async function listTenants(userId: string): Promise<TenantPublicDto[]> {
  const uid = requireUserId(userId);
  const memberships = await repo.listActiveMemberships(uid);
  if (memberships.length === 0) return [];
  const tenants = await repo.listTenantsByIds(memberships.map((membership) => membership.tenant_id));
  const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  return memberships.flatMap((membership) => {
    const tenant = byId.get(membership.tenant_id);
    if (!tenant || tenant.status !== 'active') return [];
    return [toPublic(tenant, membership)];
  });
}

export async function createTenant(userId: string, input: {
  name: string;
  slug?: string;
  plan?: string;
}): Promise<TenantPublicDto> {
  const uid = requireUserId(userId);
  const name = (input.name || '').trim();
  if (name.length < 2 || name.length > 100) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Tenant name must be 2-100 characters.' });
  }
  const slug = normalizeSlug(input.slug || name);
  const tenant = await repo.insertTenant({ name, slug, created_by: uid, plan: input.plan ?? 'byod' });
  const membership = await repo.insertMember({ tenant_id: tenant.id, user_id: uid, role: 'owner', is_default: true });
  return toPublic(tenant, membership);
}

export async function setDefaultTenant(userId: string, tenantId: string): Promise<void> {
  const uid = requireUserId(userId);
  await resolveTenant(uid, tenantId);
  await repo.setDefaultMembership(uid, tenantId);
}

export function resolveRequestedTenantId(request: any): string | null {
  const header = typeof request?.headers?.[TENANT_HEADER] === 'string'
    ? request.headers[TENANT_HEADER].trim()
    : '';
  const body = typeof request?.body?.tenant_id === 'string' ? request.body.tenant_id.trim() : '';
  const query = typeof request?.query?.tenant_id === 'string' ? request.query.tenant_id.trim() : '';
  const values = [header, body, query].filter((value) => value.length > 0);
  if (values.length === 0) return null;
  if (new Set(values).size !== 1) throw tenantForbidden('Conflicting tenant identifiers.');
  return values[0];
}

export async function resolveRequestTenant(request: any): Promise<ResolvedTenant> {
  const userId = request?.authContext?.userId;
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Authentication required.' });
  }
  return resolveTenant(userId, resolveRequestedTenantId(request));
}
