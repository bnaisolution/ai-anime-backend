'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApp, signFor } = require('../helpers/app');
require('../helpers/env');

const OWNER = 'owner-tenant-db';
const USER = 'normal-tenant-db';

function ownerHeaders(app) {
  return { authorization: `Bearer ${signFor(app, OWNER, { email: 'owner@test.invalid' })}` };
}

function userHeaders(app) {
  return { authorization: `Bearer ${signFor(app, USER, { email: 'user@test.invalid' })}` };
}

test('owner tenant database list applies filters and returns registry rows', async () => {
  const { app, fake } = await buildApp({
    includeLore: false,
    supabaseHandler: (call) => {
      if (call.table === 'anime_tenant_databases') {
        return {
          data: [{
            id: 'db-1',
            tenant_id: '44444444-4444-4444-8444-444444444444',
            mode: 'byod',
            provider: 'postgres',
            status: 'error',
            schema_version: 1,
            dsn_host: 'db.example.com',
            database_name: 'anime',
            last_error: 'connection refused',
            anime_tenants: { name: 'Studio One', slug: 'studio-one' },
          }],
          error: null,
        };
      }
      return { data: [], error: null };
    },
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/anime/owner/tenant-databases?status=error&mode=byod&provider=postgres&q=db.example',
      headers: ownerHeaders(app),
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data[0].dsn_host, 'db.example.com');
    const query = fake.state.calls.find((call) => call.table === 'anime_tenant_databases');
    assert.ok(query);
    assert.deepEqual(
      query.filters.filter((filter) => filter.op === 'eq').map((filter) => [filter.col, filter.value]),
      [['status', 'error'], ['mode', 'byod'], ['provider', 'postgres']],
    );
    assert.equal(query.filters.find((filter) => filter.op === 'or').value, 'dsn_host.ilike.%db.example%,database_name.ilike.%db.example%');
  } finally {
    await app.close();
  }
});

test('owner feature status is read-only and reflects environment flags', async () => {
  const { app } = await buildApp({ includeLore: false });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/anime/owner/features',
      headers: ownerHeaders(app),
    });
    assert.equal(response.statusCode, 200);
    const data = response.json().data;
    assert.equal(data.byod_enabled, false);
    assert.equal(data.platform_db_enabled, false);
    assert.equal(data.platform_managed_enabled, false);
    assert.equal(data.platform_billing_enabled, false);
    assert.equal(data.source, 'environment');
  } finally {
    await app.close();
  }
});

test('normal users cannot list tenant databases or feature flags', async () => {
  const { app } = await buildApp({ includeLore: false });
  try {
    for (const url of ['/v1/anime/owner/tenant-databases', '/v1/anime/owner/features']) {
      const response = await app.inject({ method: 'GET', url, headers: userHeaders(app) });
      assert.equal(response.statusCode, 403);
    }
  } finally {
    await app.close();
  }
});

test('owner schema repair is disabled while BYOD is off and forbidden for normal users', async () => {
  const { app } = await buildApp({ includeLore: false });
  const tenantId = '44444444-4444-4444-8444-444444444444';
  try {
    const owner = await app.inject({
      method: 'POST',
      url: `/v1/anime/owner/tenant-databases/${tenantId}/provision`,
      headers: ownerHeaders(app),
    });
    assert.equal(owner.statusCode, 503);
    assert.equal(owner.json().error.code, 'PROVIDER_UNAVAILABLE');

    const user = await app.inject({
      method: 'POST',
      url: `/v1/anime/owner/tenant-databases/${tenantId}/provision`,
      headers: userHeaders(app),
    });
    assert.equal(user.statusCode, 403);
  } finally {
    await app.close();
  }
});
