'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const repo = H.dist('modules/anime/tenant/tenantDatabase.repo.js');
const service = H.dist('modules/anime/tenant/tenantDatabase.service.js');

const original = {
  getTenantDatabaseRecord: repo.getTenantDatabaseRecord,
  getProjectIndex: repo.getProjectIndex,
  listActiveTenantDatabaseRecords: repo.listActiveTenantDatabaseRecords,
};
const originalFlag = process.env.ANIME_BYOD_ENABLED;

function restore() {
  repo.getTenantDatabaseRecord = original.getTenantDatabaseRecord;
  repo.getProjectIndex = original.getProjectIndex;
  repo.listActiveTenantDatabaseRecords = original.listActiveTenantDatabaseRecords;
  if (originalFlag === undefined) delete process.env.ANIME_BYOD_ENABLED;
  else process.env.ANIME_BYOD_ENABLED = originalFlag;
}

function record(overrides = {}) {
  return {
    tenant_id: 'tenant-a',
    mode: 'byod',
    provider: 'postgres',
    status: 'active',
    encrypted_dsn: 'encrypted',
    key_version: 1,
    ...overrides,
  };
}

test('BYOD stays disabled and resolves centrally by default', async () => {
  process.env.ANIME_BYOD_ENABLED = 'false';
  const result = await service.resolveTenantDataPlane('tenant-a');
  assert.equal(result.central, true);
  assert.equal(result.reason, 'byod_disabled');
});

test('paused user databases fail closed without a central fallback', async () => {
  process.env.ANIME_BYOD_ENABLED = 'true';
  repo.getTenantDatabaseRecord = async () => record({ status: 'paused' });
  try {
    await assert.rejects(
      service.resolveTenantDataPlane('tenant-a'),
      /database is unavailable/i,
    );
  } finally {
    restore();
  }
});

test('active user databases without a stored DSN fail closed', async () => {
  process.env.ANIME_BYOD_ENABLED = 'true';
  repo.getTenantDatabaseRecord = async () => record({ encrypted_dsn: null });
  try {
    await assert.rejects(
      service.resolveTenantDataPlane('tenant-a'),
      /not configured/i,
    );
  } finally {
    restore();
  }
});

test('project routing never trusts a mismatched tenant index', async () => {
  process.env.ANIME_BYOD_ENABLED = 'true';
  repo.getProjectIndex = async () => ({ project_id: 'p1', tenant_id: 'tenant-b', data_plane: 'byod' });
  let lookedUp = false;
  repo.getTenantDatabaseRecord = async () => {
    lookedUp = true;
    return record();
  };
  try {
    const result = await service.resolveProjectDataPlane('p1', 'tenant-a');
    assert.equal(result.central, true);
    assert.equal(result.reason, 'project_central');
    assert.equal(lookedUp, false);
  } finally {
    restore();
  }
});

test('active tenant listing excludes disabled or unchecked databases', async () => {
  process.env.ANIME_BYOD_ENABLED = 'true';
  repo.listActiveTenantDatabaseRecords = async () => [
    record({ tenant_id: 'active', encrypted_dsn: null }),
    record({ tenant_id: 'paused', status: 'paused' }),
  ];
  try {
    const planes = await service.listActiveByodDataPlanes();
    assert.deepEqual(planes, []);
  } finally {
    restore();
  }
});

test('central rollback rejects after the seven-day window', async () => {
  process.env.ANIME_BYOD_ENABLED = 'true';
  repo.getProjectIndex = async () => ({
    project_id: 'p1',
    tenant_id: 'tenant-a',
    data_plane: 'byod',
    cutover_status: 'byod',
    migrated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
  });
  try {
    await assert.rejects(
      service.rollbackProjectsToCentral({ tenantId: 'tenant-a', userId: 'u1', projectIds: ['p1'] }),
      /rollback window has expired/i,
    );
  } finally {
    restore();
  }
});
