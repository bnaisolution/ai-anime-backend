'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const {
  TENANT_DATA_TABLES,
  TENANT_PROJECT_TABLES,
  TENANT_SCHEMA_SQL,
  TENANT_SCHEMA_VERSION,
} = H.dist('modules/anime/tenant/tenantSchema.js');
const { PROJECT_TABLES } = H.dist('modules/anime/internal/workflowGateway.db.js');

test('tenant schema covers every gateway project table', () => {
  assert.equal(TENANT_SCHEMA_VERSION, 2);
  assert.equal(TENANT_DATA_TABLES.length, 30);
  assert.equal(TENANT_PROJECT_TABLES.size, 30);
  for (const table of PROJECT_TABLES) {
    assert.ok(TENANT_PROJECT_TABLES.has(table), `missing tenant table ${table}`);
  }
  for (const table of TENANT_DATA_TABLES) {
    assert.match(TENANT_SCHEMA_SQL, new RegExp(`CREATE TABLE IF NOT EXISTS anime_data\\.${table} \\(`));
  }
});

test('tenant schema is idempotent and season aware', () => {
  assert.doesNotMatch(TENANT_SCHEMA_SQL, /\bpublic\./);
  assert.doesNotMatch(TENANT_SCHEMA_SQL, /\bDROP\b/);
  assert.doesNotMatch(TENANT_SCHEMA_SQL, /\bREFERENCES\b/);
  assert.match(TENANT_SCHEMA_SQL, /CREATE UNIQUE INDEX IF NOT EXISTS episodes_project_season_ep_uidx/);
  assert.match(TENANT_SCHEMA_SQL, /CREATE UNIQUE INDEX IF NOT EXISTS scene[^\n]*season_ep/);
  assert.match(TENANT_SCHEMA_SQL, /ALTER TABLE anime_data\.projects ADD COLUMN IF NOT EXISTS tenant_id uuid/);
  assert.match(TENANT_SCHEMA_SQL, /INSERT INTO anime_data\.schema_migrations \(version\) VALUES \(2\)/);
});
