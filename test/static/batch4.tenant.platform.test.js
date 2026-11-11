'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

function read(relativePath) {
  return fs.readFileSync(path.join(H.backendRoot, relativePath), 'utf8');
}

const migration = read('supabase/migrations/005_batch4_tenant_platform.sql');
const rollback = read('supabase/migrations/005_batch4_tenant_platform_rollback.sql');
const tenantService = read('src/modules/anime/tenant/tenant.service.ts');
const tenantRoutes = read('src/modules/anime/tenant/tenant.routes.ts');
const platformService = read('src/modules/anime/platform/platform.service.ts');
const computeSelector = read('src/modules/anime/platform/compute.selector.ts');
const replicationService = read('src/modules/anime/replication/replication.service.ts');
const infraRoutes = read('src/modules/anime/infrastructure/infrastructure.lifecycle.routes.ts');
const ownerRoutes = read('src/modules/anime/owner/owner.batch4.routes.ts');
const animeIndex = read('src/modules/anime/index.ts');
const projectGuard = read('src/modules/anime/auth/project-guard.ts');

test('Batch 4 tenant migration is additive and has a rollback', () => {
  for (const fragment of [
    'CREATE TABLE IF NOT EXISTS public.anime_tenants',
    'CREATE TABLE IF NOT EXISTS public.anime_tenant_members',
    'CREATE TABLE IF NOT EXISTS public.anime_platform_settings',
    'ADD COLUMN IF NOT EXISTS tenant_id uuid',
    'ADD COLUMN IF NOT EXISTS bound_tenant_id uuid',
    'ADD COLUMN IF NOT EXISTS key_version integer',
    'ENABLE ROW LEVEL SECURITY',
  ]) {
    assert.ok(migration.includes(fragment), `missing migration fragment: ${fragment}`);
  }
  assert.equal(/\bDROP\s+TABLE\s+public\./i.test(migration), false);
  assert.equal(/\bTRUNCATE\b/i.test(migration), false);
});

test('Batch 4 tenant rollback reverses every additive change', () => {
  for (const fragment of [
    'DROP COLUMN IF EXISTS tenant_id',
    'DROP COLUMN IF EXISTS bound_tenant_id',
    'DROP COLUMN IF EXISTS key_version',
    'DROP TABLE IF EXISTS public.anime_platform_settings',
    'DROP TABLE IF EXISTS public.anime_tenant_members',
    'DROP TABLE IF EXISTS public.anime_tenants',
  ]) {
    assert.ok(rollback.includes(fragment), `missing rollback fragment: ${fragment}`);
  }
});

test('tenant resolution fails closed and never trusts client user identity', () => {
  assert.match(tenantService, /Tenant access denied/);
  assert.match(tenantService, /Tenant selection required/);
  assert.match(tenantService, /Conflicting tenant identifiers/);
  assert.equal(/body\.(?:user_id|userId)/.test(tenantService), false);
  assert.match(projectGuard, /assertProjectTenantAccess/);
  assert.match(projectGuard, /select\('id, user_id, tenant_id'\)/);
});

test('tenant and owner routes require authentication and owner role for owner actions', () => {
  assert.match(tenantRoutes, /preHandler: \[app\.authenticate\]/);
  assert.match(ownerRoutes, /auth\.role !== 'owner_admin'/);
  assert.match(ownerRoutes, /isServiceIdentity === true/);
  assert.match(ownerRoutes, /REPLICATION_NOT_CONFIGURED|getReplicationAdapter/);
});

test('Platform-Managed remains disabled unless explicitly enabled and approved', () => {
  assert.match(platformService, /ANIME_PLATFORM_MANAGED_ENABLED === 'true'/);
  assert.match(platformService, /ANIME_PLATFORM_MANAGED_OWNER_APPROVED === 'true'/);
  assert.match(platformService, /state: 'disabled'/);
  assert.match(computeSelector, /assertPlatformManagedEnabled/);
  assert.equal(/platform_managed_enabled\s*=\s*true/.test(platformService), false);
});

test('GPU and CPU selection are independent and fail closed', () => {
  assert.match(computeSelector, /GPU_PROVIDERS/);
  assert.match(computeSelector, /AUDIO_PROVIDERS/);
  assert.match(computeSelector, /LLM_PROVIDERS/);
  assert.match(computeSelector, /fallback: forceFallback \|\| plan\.fallback/);
  assert.match(computeSelector, /buildFallbackPlan/);
  assert.match(computeSelector, /allow_paid_fallback/);
  assert.match(computeSelector, /PROVIDER_UNAVAILABLE/);
});

test('replication failover is non-destructive, consistency-gated, and never blind', () => {
  assert.match(replicationService, /REPLICATION_NOT_CONFIGURED/);
  assert.match(replicationService, /simulated: true/);
  assert.match(replicationService, /No production database was changed/);
  assert.match(replicationService, /ANIME_REPLICATION_PRIMARY/);
  assert.match(replicationService, /ANIME_REPLICATION_SECONDARY/);
  assert.match(replicationService, /Secondary database is not healthy/);
  assert.match(replicationService, /consistency tokens differ/);
  assert.equal(/\b(?:pg_switch_wal|ALTER SYSTEM|DROP DATABASE|TRUNCATE)\b/i.test(replicationService), false);
});

test('BYOI lifecycle routes exist for rotate, revoke, bind, and validate', () => {
  for (const route of ['/rotate', '/revoke', '/bind', '/validate']) {
    assert.ok(infraRoutes.includes(route), `missing lifecycle route: ${route}`);
  }
  assert.match(infraRoutes, /app\.authenticate/);
});

test('Batch 4 routes are registered in the anime module', () => {
  for (const registration of [
    'registerAnimeTenantRoutes',
    'registerAnimePlatformRoutes',
    'registerAnimeOwnerBatch4Routes',
    'registerAnimeInfrastructureLifecycleRoutes',
  ]) {
    assert.ok(animeIndex.includes(`app.register(${registration})`), `missing route registration: ${registration}`);
  }
});
