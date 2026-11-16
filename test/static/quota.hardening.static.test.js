'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

function read(relativePath) {
  return fs.readFileSync(path.join(H.backendRoot, relativePath), 'utf8');
}

const migration = read('supabase/migrations/010_quota_and_security_hardening.sql');
const dispatcher = read('src/modules/anime/outbox/outbox.dispatcher.ts');
const supervisor = read('src/modules/anime/supervisor/supervisor.worker.ts');
const supervisorRepo = read('src/modules/anime/supervisor/supervisor.repo.ts');

test('outbox redaction is batched and scheduled outside the polling loop', () => {
  assert.match(migration, /payload_redacted_at/);
  assert.match(migration, /LIMIT 100/);
  assert.match(dispatcher, /ANIME_PAYLOAD_REDACTION_INTERVAL_MS/);
  assert.match(dispatcher, /start\(pollIntervalMs = 10000\)/);
});

test('outbox claim enforces the retry cap before claiming', () => {
  assert.match(migration, /attempts >= 5/);
  assert.match(migration, /status = 'dead_letter'/);
  assert.match(migration, /oe\.attempts < 5/);
});

test('sensitive SECURITY DEFINER functions and tables are not exposed to anon', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.claim_outbox_batch\(text, integer\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.kaggle_sessions/);
  assert.match(migration, /ALTER TABLE public\.kaggle_sessions ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\.story_state ENABLE ROW LEVEL SECURITY/);
});

test('supervisor polling is reduced and pending actions are filtered in the database', () => {
  assert.match(supervisor, /start\(poll = 10000/);
  assert.match(supervisorRepo, /select\('job_id'\)/);
  assert.match(supervisorRepo, /eq\('job_id', commandId\)/);
});
