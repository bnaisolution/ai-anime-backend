'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

function read(relativePath) {
  return fs.readFileSync(path.join(H.backendRoot, relativePath), 'utf8');
}

const infraRoutes = read('src/modules/anime/infrastructure/infrastructure.routes.ts');
const workerRoutes = read('src/modules/anime/internal/workflowWorker.routes.ts');
const migration = read('supabase/migrations/009_kaggle_sessions_user_scope.sql');

test('embedded Kaggle worker never receives the anime service-role key', () => {
  assert.doesNotMatch(infraRoutes, /SUPABASE_KEY\s*=\s*"\$\{/);
  assert.doesNotMatch(infraRoutes, /ANIME_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(infraRoutes, /update_supabase_clip_checkpoint/);
  assert.match(infraRoutes, /buildKaggleLocalTunnelScript\(\s*backendBaseUrl,\s*sessionToken,\s*slotName\s*\)/);
});

test('Kaggle worker registers its tunnel through the scoped backend session route', () => {
  assert.match(infraRoutes, /\/v1\/anime\/internal\/worker\/session/);
  assert.match(infraRoutes, /scope: \['gpu_session'\]/);
  assert.match(workerRoutes, /verifyWorkerJobToken\(bearerToken\(request\), 'gpu_session'\)/);
  assert.match(workerRoutes, /onConflict: 'user_id,session_name'/);
  assert.match(workerRoutes, /GPU_SESSION_NAMES/);
  assert.match(workerRoutes, /TUNNEL_HOST_SUFFIXES/);
  assert.match(infraRoutes, /isAllowedWorkerEndpoint/);
});

test('Kaggle sessions are uniquely scoped by user and session name', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS user_id text/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS tenant_id uuid/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS kaggle_sessions_session_name_key/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS idx_kaggle_sessions_user_session/);
  assert.match(migration, /ON public\.kaggle_sessions \(user_id, session_name\)/);
});

test('Kaggle worker self-terminates when idle or past its max lifetime', () => {
  assert.match(infraRoutes, /WORKER_IDLE_SHUTDOWN_SECONDS = \$\{idleShutdownSeconds\}/);
  assert.match(infraRoutes, /WORKER_MAX_LIFETIME_SECONDS = \$\{maxLifetimeSeconds\}/);
  assert.match(infraRoutes, /def idle_shutdown_watchdog/);
  assert.match(infraRoutes, /def max_lifetime_watchdog/);
  assert.match(infraRoutes, /start_lifecycle_watchdogs\(\)/);
  assert.match(infraRoutes, /@app\.post\("\/v1\/gpu\/shutdown"\)/);
  assert.match(infraRoutes, /notify_backend_session_closed\(reason\)/);
  assert.match(infraRoutes, /\/v1\/anime\/internal\/worker\/session\/closed/);
});

test('Backend can stop Kaggle sessions and refuses duplicate GPU launches', () => {
  assert.match(infraRoutes, /\/v1\/anime\/infrastructure\/gpu\/stop/);
  assert.match(infraRoutes, /stopAllKaggleWorkersForUser/);
  assert.match(infraRoutes, /stopKaggleWorkerSession/);
  assert.match(infraRoutes, /duplicate launch suppressed/);
  assert.match(infraRoutes, /KAGGLE_SESSION_MAX_AGE_MS/);
  assert.match(workerRoutes, /\/v1\/anime\/internal\/worker\/session\/closed/);
  assert.match(workerRoutes, /status: 'stopped', api_endpoint: null/);
});
