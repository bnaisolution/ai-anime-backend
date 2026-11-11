'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

test('versioned key registry, re-encryption route, and KMS-ready custody are present', () => {
  const registry = fs.readFileSync(path.join(ROOT, 'src/modules/anime/infrastructure/keyRegistry.ts'), 'utf8');
  const service = fs.readFileSync(path.join(ROOT, 'src/modules/anime/infrastructure/infrastructure.service.ts'), 'utf8');
  const routes = fs.readFileSync(path.join(ROOT, 'src/modules/anime/infrastructure/infrastructure.lifecycle.routes.ts'), 'utf8');
  const runbook = fs.readFileSync(path.join(ROOT, 'docs/operations/KEY_ROTATION_RUNBOOK.md'), 'utf8');

  assert.match(registry, /ANIME_ENCRYPTION_KEYS/);
  assert.match(registry, /ANIME_ENCRYPTION_KEY_VERSION/);
  assert.match(registry, /ANIME_KMS_KEY_ID/);
  assert.match(registry, /root_outside_database/);
  assert.match(service, /reencryptUserInfrastructure/);
  assert.match(service, /decryptWithKeyVersion/);
  assert.match(service, /encryptWithCurrentKey/);
  assert.match(routes, /infrastructure\/reencrypt/);
  assert.match(routes, /infrastructure\/key-custody/);
  assert.match(runbook, /Recovery and rollback/);
  assert.match(runbook, /ANIME_ENCRYPTION_KEYS/);
});
