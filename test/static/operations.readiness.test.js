'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

function read(relativePath) {
  return fs.readFileSync(path.join(H.backendRoot, relativePath), 'utf8');
}

test('observability routes are registered and metrics are gated', () => {
  const index = read('src/modules/anime/index.ts');
  const routes = read('src/modules/anime/observability/observability.routes.ts');
  assert.match(index, /registerAnimeObservabilityRoutes/);
  for (const route of ['/v1/anime/live', '/v1/anime/ready', '/v1/anime/metrics']) {
    assert.ok(routes.includes(route), `missing route ${route}`);
  }
  assert.match(routes, /ANIME_METRICS_ENABLED === 'true'/);
  assert.match(routes, /ANIME_METRICS_TOKEN/);
  assert.match(routes, /metrics_disabled/);
});

test('backup and restore scripts require explicit safety controls', () => {
  const backup = read('scripts/backup_anime_db.sh');
  const restore = read('scripts/restore_anime_db.sh');
  const drill = read('scripts/dr_drill.sh');
  assert.match(backup, /pg_dump --format=custom/);
  assert.match(backup, /sha256sum/);
  assert.match(backup, /pg_restore --list/);
  assert.match(restore, /ANIME_RESTORE_CONFIRM/);
  assert.match(restore, /sha256sum -c/);
  assert.match(drill, /ANIME_DRILL_CONFIRM/);
  assert.match(drill, /must not be the backup source/);
  for (const script of [backup, restore, drill]) {
    assert.equal(/password\s*=\s*\S+/i.test(script), false, 'script must not hardcode passwords');
  }
});

test('operations runbooks cover observability and disaster recovery', () => {
  const observability = read('docs/operations/OBSERVABILITY_RUNBOOK.md');
  const backup = read('docs/operations/BACKUP_DR_RUNBOOK.md');
  assert.match(observability, /anime_http_requests_total/);
  assert.match(observability, /Incident response/);
  assert.match(backup, /Target RPO/);
  assert.match(backup, /Target RTO/);
  assert.match(backup, /isolated database/);
});
