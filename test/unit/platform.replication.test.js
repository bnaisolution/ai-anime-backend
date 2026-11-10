'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const { getPlatformManagedStatus, assertPlatformManagedEnabled } = H.dist('modules/anime/platform/platform.service.js');
const { getReplicationAdapter } = H.dist('modules/anime/replication/replication.service.js');

test('Platform-Managed is disabled by default and exposes no fake capacity', () => {
  delete process.env.ANIME_PLATFORM_MANAGED_ENABLED;
  delete process.env.ANIME_PLATFORM_MANAGED_OWNER_APPROVED;
  const status = getPlatformManagedStatus();
  assert.equal(status.enabled, false);
  assert.equal(status.mode, 'byod');
  assert.equal(status.billing_enabled, false);
  assert.equal(status.providers.every((provider) => provider.state === 'disabled'), true);
  assert.throws(() => assertPlatformManagedEnabled('activation'), (error) => error.code === 'PLATFORM_MANAGED_DISABLED');
});

test('Platform-Managed requires both environment enablement and owner approval', () => {
  process.env.ANIME_PLATFORM_MANAGED_ENABLED = 'true';
  delete process.env.ANIME_PLATFORM_MANAGED_OWNER_APPROVED;
  assert.equal(getPlatformManagedStatus().enabled, false);
  process.env.ANIME_PLATFORM_MANAGED_OWNER_APPROVED = 'true';
  assert.equal(getPlatformManagedStatus().enabled, true);
  delete process.env.ANIME_PLATFORM_MANAGED_ENABLED;
  delete process.env.ANIME_PLATFORM_MANAGED_OWNER_APPROVED;
});

test('replication defaults to not configured and refuses failover', async () => {
  delete process.env.ANIME_REPLICATION_MODE;
  const adapter = getReplicationAdapter();
  const status = await adapter.status();
  assert.equal(status.configured, false);
  assert.equal(status.failover_supported, false);
  assert.equal(status.secondary.healthy, 'not_configured');
  await assert.rejects(
    () => adapter.failover({ confirmed: true, requestedBy: 'owner' }),
    (error) => error.code === 'REPLICATION_NOT_CONFIGURED'
  );
});

test('mock replication is explicitly simulated and cannot claim production failover', async () => {
  process.env.ANIME_REPLICATION_MODE = 'mock';
  const adapter = getReplicationAdapter();
  const status = await adapter.status();
  assert.equal(status.configured, true);
  assert.equal(status.mode, 'mock');
  const result = await adapter.failover({ confirmed: true, requestedBy: 'owner' });
  assert.equal(result.simulated, true);
  assert.match(result.message, /No production database was changed/);
  delete process.env.ANIME_REPLICATION_MODE;
});
