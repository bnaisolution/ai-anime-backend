'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const { resolveTenant, resolveRequestedTenantId, listTenants } = H.dist('modules/anime/tenant/tenant.service.js');
const { requireProjectRole } = H.dist('modules/anime/auth/project-guard.js');

const USER = '11111111-1111-4111-8111-111111111111';
const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROJECT = '33333333-3333-4333-8333-333333333333';

function tenant(id, overrides = {}) {
  return {
    id,
    name: `Tenant ${id.slice(0, 4)}`,
    slug: `tenant-${id.slice(0, 4)}`,
    status: 'active',
    plan: 'byod',
    is_platform_managed: false,
    created_by: USER,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function membership(tenantId, overrides = {}) {
  return {
    tenant_id: tenantId,
    user_id: USER,
    role: 'owner',
    status: 'active',
    is_default: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function install({ memberships = [], tenants = [], project = null }) {
  return installFakeSupabase(async (call) => {
    if (call.table === 'anime_tenant_members' && call.action === 'select') {
      if (call.mode === 'maybeSingle') {
        const tenantFilter = call.filters.find((filter) => filter.col === 'tenant_id');
        return { data: memberships.find((item) => item.tenant_id === tenantFilter?.value) ?? null, error: null };
      }
      return { data: memberships, error: null };
    }
    if (call.table === 'anime_tenants' && call.action === 'select') {
      if (call.mode === 'maybeSingle') {
        const idFilter = call.filters.find((filter) => filter.col === 'id');
        return { data: tenants.find((item) => item.id === idFilter?.value) ?? null, error: null };
      }
      const inFilter = call.filters.find((filter) => filter.col === 'id' && filter.op === 'in');
      return { data: inFilter ? tenants.filter((item) => inFilter.value.includes(item.id)) : tenants, error: null };
    }
    if (call.table === 'projects' && call.action === 'select') {
      return { data: project, error: null };
    }
    return { data: null, error: null };
  });
}

test('tenant resolver uses the single active membership', async () => {
  install({ memberships: [membership(TENANT_A)], tenants: [tenant(TENANT_A)] });
  const resolved = await resolveTenant(USER);
  assert.equal(resolved.tenant.id, TENANT_A);
  assert.equal(resolved.membership.role, 'owner');
});

test('tenant resolver requires explicit selection when multiple memberships have no default', async () => {
  install({
    memberships: [membership(TENANT_A), membership(TENANT_B)],
    tenants: [tenant(TENANT_A), tenant(TENANT_B)],
  });
  await assert.rejects(() => resolveTenant(USER), (error) => error.code === 'TENANT_REQUIRED');
});

test('tenant resolver honours the default membership when multiple exist', async () => {
  install({
    memberships: [membership(TENANT_A), membership(TENANT_B, { is_default: true })],
    tenants: [tenant(TENANT_A), tenant(TENANT_B)],
  });
  const resolved = await resolveTenant(USER);
  assert.equal(resolved.tenant.id, TENANT_B);
});

test('tenant resolver denies requested tenants without membership', async () => {
  install({ memberships: [membership(TENANT_A)], tenants: [tenant(TENANT_A), tenant(TENANT_B)] });
  await assert.rejects(() => resolveTenant(USER, TENANT_B), (error) => error.code === 'TENANT_FORBIDDEN');
});

test('tenant resolver denies suspended tenants', async () => {
  install({ memberships: [membership(TENANT_A)], tenants: [tenant(TENANT_A, { status: 'suspended' })] });
  await assert.rejects(() => resolveTenant(USER, TENANT_A), (error) => error.code === 'TENANT_FORBIDDEN');
});

test('tenant request identifiers cannot be overridden or conflict', () => {
  assert.equal(resolveRequestedTenantId({ headers: { 'x-tenant-id': TENANT_A }, body: { tenant_id: TENANT_A }, query: {} }), TENANT_A);
  assert.throws(
    () => resolveRequestedTenantId({ headers: { 'x-tenant-id': TENANT_A }, body: { tenant_id: TENANT_B }, query: {} }),
    (error) => error.code === 'TENANT_FORBIDDEN'
  );
});

test('listTenants only exposes active memberships', async () => {
  install({
    memberships: [membership(TENANT_A), membership(TENANT_B)],
    tenants: [tenant(TENANT_A), tenant(TENANT_B, { status: 'disabled' })],
  });
  const tenants = await listTenants(USER);
  assert.deepEqual(tenants.map((item) => item.id), [TENANT_A]);
});

test('project guard denies a project tenant when the user is not a member', async () => {
  install({
    memberships: [],
    tenants: [tenant(TENANT_A)],
    project: { id: PROJECT, user_id: USER, tenant_id: TENANT_A },
  });
  const request = {
    authContext: { userId: USER, role: 'owner' },
    params: { id: PROJECT },
    body: {},
    query: {},
    server: {},
  };
  await assert.rejects(
    () => requireProjectRole(['owner'])(request, {}),
    (error) => error.code === 'TENANT_FORBIDDEN'
  );
});

test('project guard denies a conflicting tenant header before ownership work', async () => {
  install({
    memberships: [membership(TENANT_A)],
    tenants: [tenant(TENANT_A), tenant(TENANT_B)],
    project: { id: PROJECT, user_id: USER, tenant_id: TENANT_A },
  });
  const request = {
    authContext: { userId: USER, role: 'owner' },
    params: { id: PROJECT },
    headers: { 'x-tenant-id': TENANT_B },
    body: {},
    query: {},
    server: {},
  };
  await assert.rejects(
    () => requireProjectRole(['owner'])(request, {}),
    (error) => error.code === 'PROJECT_FORBIDDEN'
  );
});
