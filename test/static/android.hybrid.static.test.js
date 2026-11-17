'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const androidRoot = path.join(H.repoRoot, 'ai-anime-android');
const mainJava = path.join(androidRoot, 'app/src/main/java/org/dpdns/bnai/anime');
const api = fs.readFileSync(path.join(mainJava, 'core/network/AnimeApiService.kt'), 'utf8');
const repository = fs.readFileSync(path.join(mainJava, 'core/network/AnimeRepository.kt'), 'utf8');
const settings = fs.readFileSync(path.join(mainJava, 'ui/settings/SettingsScreen.kt'), 'utf8');
const owner = fs.readFileSync(path.join(mainJava, 'ui/owner/OwnerOverviewScreen.kt'), 'utf8');
const tags = fs.readFileSync(path.join(mainJava, 'ui/testing/TestTags.kt'), 'utf8');

test('Android BYOD endpoints match backend hybrid routes', () => {
  for (const route of [
    'v1/anime/tenants/me/database',
    'v1/anime/tenants/me/database/test',
    'v1/anime/tenants/me/database/connect',
    'v1/anime/tenants/me/database/health',
    'v1/anime/tenants/me/database/migrate',
    'v1/anime/tenants/me/wallet',
    'v1/anime/owner/tenant-databases',
    'v1/anime/owner/tenant-databases/{tenantId}/audit',
    'v1/anime/owner/tenant-databases/{tenantId}/health-check',
    'v1/anime/owner/features',
  ]) {
    assert.match(api, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing ${route}`);
  }
});

test('Settings UI exposes DSN test/connect/health/migrate/disconnect actions', () => {
  for (const tag of ['DB_DSN', 'DB_TEST_DSN', 'DB_CONNECT', 'DB_HEALTH', 'DB_MIGRATE', 'DB_DISCONNECT']) {
    assert.match(tags, new RegExp(`const val ${tag}`), `missing TestTags.Settings.${tag}`);
    assert.match(settings, new RegExp(`TestTags\\.Settings\\.${tag}`), `settings does not use ${tag}`);
  }
  assert.match(settings, /repository\.connectTenantDatabase/);
  assert.match(settings, /repository\.fetchTenantDatabaseHealth/);
  assert.match(settings, /PasswordVisualTransformation/);
  assert.doesNotMatch(settings, /Toast\.makeText\(context, databaseDsn/);
});

test('Owner console reads the tenant database registry and wallet', () => {
  assert.match(repository, /fetchOwnerTenantDatabases/);
  assert.match(repository, /fetchOwnerTenantDatabaseAudit/);
  assert.match(repository, /recheckOwnerTenantDatabase/);
  assert.match(repository, /fetchOwnerFeatureFlags/);
  assert.match(repository, /fetchOwnerTenantWallet/);
  assert.match(owner, /TestTags\.Owner\.TENANT_DATABASES/);
  assert.match(owner, /User Database Registry/);
});

test('Owner console exposes database filters, audit, recheck, and feature flags', () => {
  for (const tag of ['DB_FILTER_ALL', 'DB_FILTER_ACTIVE', 'DB_FILTER_ERROR', 'DB_RECHECK', 'DB_AUDIT', 'FEATURE_FLAGS']) {
    assert.match(tags, new RegExp(`const val ${tag}`), `missing TestTags.Owner.${tag}`);
    assert.match(owner, new RegExp(`TestTags\\.Owner\\.${tag}`), `owner does not use ${tag}`);
  }
  assert.match(owner, /fetchOwnerTenantDatabaseAudit/);
  assert.match(owner, /recheckOwnerTenantDatabase/);
  assert.match(owner, /fetchOwnerFeatureFlags/);
});
