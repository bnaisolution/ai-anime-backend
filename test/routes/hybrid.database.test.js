'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const { buildApp } = require('../helpers/app');

function has(app, method, url) {
  return app.hasRoute({ method, url });
}

test('tenant database and wallet routes are registered once', async () => {
  const { app } = await buildApp({ includeLore: false });
  const routes = [
    ['GET', '/v1/anime/tenants/me/database'],
    ['POST', '/v1/anime/tenants/me/database/test'],
    ['POST', '/v1/anime/tenants/me/database/connect'],
    ['DELETE', '/v1/anime/tenants/me/database'],
    ['GET', '/v1/anime/tenants/me/database/health'],
    ['POST', '/v1/anime/tenants/me/database/provision'],
    ['POST', '/v1/anime/tenants/me/database/migrate'],
    ['POST', '/v1/anime/tenants/me/database/rollback'],
    ['GET', '/v1/anime/tenants/me/wallet'],
    ['GET', '/v1/anime/tenants/me/wallet/ledger'],
    ['GET', '/v1/anime/owner/tenant-databases'],
    ['POST', '/v1/anime/owner/tenant-databases/:tenantId/health-check'],
    ['POST', '/v1/anime/owner/tenant-databases/:tenantId/provision'],
    ['GET', '/v1/anime/owner/tenant-databases/:tenantId/audit'],
    ['GET', '/v1/anime/owner/features'],
    ['GET', '/v1/anime/owner/tenants/:tenantId/wallet'],
    ['POST', '/v1/anime/owner/tenants/:tenantId/wallet/credit'],
  ];
  for (const [method, url] of routes) {
    assert.equal(has(app, method, url), true, `missing ${method} ${url}`);
  }
  await app.close();
});
