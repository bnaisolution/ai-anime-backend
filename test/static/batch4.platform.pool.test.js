'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

test('platform pool migration defines capacity, leases, queue, metering, billing, RLS, and atomic functions', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/006_batch4_platform_pool.sql'), 'utf8');
  for (const table of ['anime_platform_pool_capacity', 'anime_platform_leases', 'anime_platform_queue', 'anime_platform_usage']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(sql, /reserve_anime_platform_capacity/);
  assert.match(sql, /release_anime_platform_lease/);
  assert.match(sql, /record_anime_platform_usage/);
  assert.match(sql, /max_concurrency/);
  assert.match(sql, /idempotency_key/);
  assert.match(sql, /billable_units/);
});

test('platform pool service and routes enforce tenant scope and disabled activation', () => {
  const service = fs.readFileSync(path.join(ROOT, 'src/modules/anime/platform/platformPool.service.ts'), 'utf8');
  const routes = fs.readFileSync(path.join(ROOT, 'src/modules/anime/platform/platform.routes.ts'), 'utf8');
  const platform = fs.readFileSync(path.join(ROOT, 'src/modules/anime/platform/platform.service.ts'), 'utf8');

  assert.match(service, /assertPlatformManagedEnabled/);
  assert.match(service, /reserve_anime_platform_capacity/);
  assert.match(service, /record_anime_platform_usage/);
  assert.match(service, /tenant_id/);
  assert.match(service, /drainPlatformQueue/);
  assert.match(routes, /platform\/pool\/reserve/);
  assert.match(routes, /platform\/pool\/queue/);
  assert.match(routes, /platform\/usage/);
  assert.match(routes, /platform\/billing\/summary/);
  assert.match(routes, /resolveTenant/);
  assert.match(platform, /ANIME_PLATFORM_MANAGED_ENABLED/);
  assert.match(platform, /ANIME_PLATFORM_MANAGED_OWNER_APPROVED/);
  assert.match(platform, /PLATFORM_MANAGED_DISABLED/);
});
