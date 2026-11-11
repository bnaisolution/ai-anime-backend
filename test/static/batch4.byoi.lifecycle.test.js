'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

test('BYOI lifecycle supports unbind and tenant-scoped credential resolution', () => {
  const service = fs.readFileSync(path.join(ROOT, 'src/modules/anime/infrastructure/infrastructure.service.ts'), 'utf8');
  const routes = fs.readFileSync(path.join(ROOT, 'src/modules/anime/infrastructure/infrastructure.lifecycle.routes.ts'), 'utf8');
  const selector = fs.readFileSync(path.join(ROOT, 'src/modules/anime/platform/compute.selector.ts'), 'utf8');

  assert.match(service, /unbindFromTenant/);
  assert.match(service, /isInfrastructureVisibleToTenant/);
  assert.match(service, /getDecryptedMapForUser\(userId: string, tenantId\?: string\)/);
  assert.match(routes, /infrastructure\/:id\/unbind/);
  assert.match(routes, /infrastructure\/:id\/bind/);
  assert.match(routes, /infrastructure\/:id\/rotate/);
  assert.match(routes, /infrastructure\/:id\/revoke/);
  assert.match(selector, /isInfrastructureVisibleToTenant/);
  assert.match(selector, /tenantId\?: string/);
});
