'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const root = H.backendRoot;
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/011_hybrid_byod_wallet.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(root, 'supabase/migrations/011_hybrid_byod_wallet_rollback.sql'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src/modules/anime/tenant/tenantDatabase.service.ts'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'src/modules/anime/tenant/tenantSchema.ts'), 'utf8');
const validation = fs.readFileSync(path.join(root, 'src/modules/anime/tenant/tenantDatabase.validation.ts'), 'utf8');
const gateway = fs.readFileSync(path.join(root, 'src/modules/anime/internal/workflowGateway.routes.ts'), 'utf8');
const tenantGateway = fs.readFileSync(path.join(root, 'src/modules/anime/internal/workflowGateway.tenantDb.ts'), 'utf8');
const scopedGateway = fs.readFileSync(path.join(root, 'src/modules/anime/internal/workflowGateway.db.ts'), 'utf8');

test('tenant database registry is additive and disabled by default', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.anime_tenant_databases/);
  assert.match(migration, /encrypted_dsn text/);
  assert.match(migration, /byod_enabled boolean NOT NULL DEFAULT false/);
  assert.match(migration, /platform_db_enabled boolean NOT NULL DEFAULT false/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(rollback, /DROP TABLE IF EXISTS public\.anime_tenant_databases/);
});

test('user DSNs are encrypted, fingerprinted, and never returned in public DTOs', () => {
  assert.match(service, /encryptWithCurrentKey\(validated\.dsn\)/);
  assert.match(service, /decryptWithKeyVersion/);
  assert.match(service, /dsn_configured: Boolean\(record\?\.encrypted_dsn\)/);
  assert.doesNotMatch(service, /publicDto[\s\S]{0,400}encrypted_dsn:/);
  assert.match(validation, /createHash\('sha256'\)/);
  assert.match(validation, /Private or local database hosts are not allowed/);
});

test('project cutover and wallet are explicit and idempotent', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.anime_tenant_project_index/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.anime_platform_wallets/);
  assert.match(migration, /credit_anime_wallet/);
  assert.match(migration, /debit_anime_wallet/);
  assert.match(service, /on conflict \("id"\) \$\{conflict\}/);
  assert.match(service, /TENANT_DATA_TABLES/);
  assert.match(service, /rollbackProjectsToCentral/);
  assert.match(schema, /TENANT_SCHEMA_VERSION = 2/);
  assert.match(schema, /episodes_project_season_ep_uidx/);
});


test('workflow gateway routes project and system requests through the tenant data plane', () => {
  assert.match(gateway, /resolveProjectDataPlaneById/);
  assert.match(gateway, /executeTenantDbRequest/);
  assert.match(gateway, /executeSystemRequest/);
  assert.match(gateway, /GLOBAL_READ_TABLES\.has\(scoped\.table\)/);
  assert.match(tenantGateway, /addValue\(values, operand\)/);
  assert.match(tenantGateway, /"anime_data"/);
  assert.match(tenantGateway, /tenantClientConnection\(validated\)/);
  assert.doesNotMatch(tenantGateway, /\$\{operand\}/);
  assert.match(scopedGateway, /!input\.system && isProject/);
});
