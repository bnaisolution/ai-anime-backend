'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

test('multi-storage abstraction, user-owned adapters, and tenant-scoped routes are present', () => {
  const service = fs.readFileSync(path.join(ROOT, 'src/modules/anime/storage/storage.service.ts'), 'utf8');
  const adapters = fs.readFileSync(path.join(ROOT, 'src/modules/anime/storage/storage.adapters.ts'), 'utf8');
  const routes = fs.readFileSync(path.join(ROOT, 'src/modules/anime/storage/storage.routes.ts'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'src/modules/anime/index.ts'), 'utf8');

  assert.match(service, /StorageProviderId/);
  assert.match(service, /user-owned storage provider/i);
  assert.match(service, /tenantId/);
  assert.match(service, /selectStorageRecord/);
  assert.match(adapters, /putTelegram/);
  assert.match(adapters, /putS3/);
  assert.match(adapters, /putCustomHttp/);
  assert.match(adapters, /AWS4-HMAC-SHA256/);
  assert.match(routes, /storage\/providers/);
  assert.match(routes, /storage\/status/);
  assert.match(routes, /storage\/upload/);
  assert.match(index, /registerAnimeStorageRoutes/);
});
