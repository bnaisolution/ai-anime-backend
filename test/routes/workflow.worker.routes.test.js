'use strict';

process.env.ANIME_ENCRYPTION_KEY = 'stage3-test-anime-encryption-key-32chars';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const COMMAND_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = process.env.ANIME_WORKFLOW_GATEWAY_TOKEN;
const { encryptConfig } = H.dist('modules/anime/infrastructure/infrastructure.crypto.js');
const CONFIG_ENCRYPTED = encryptConfig(JSON.stringify({ github_worker: { worker_url: 'https://worker.example.com' } }), process.env.ANIME_ENCRYPTION_KEY);

function infraRow() {
  return {
    id: 'infra-1',
    user_id: 'user-1',
    name: 'cpu-worker',
    provider_type: 'github_actions',
    config_encrypted: CONFIG_ENCRYPTED,
    capabilities: {},
    status: 'active',
    is_default: true,
    last_verified_at: null,
    last_error: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function handler(call) {
  if (call.table === 'api_commands') {
    if (call.filters.some((filter) => filter.col === 'project_id' && filter.value !== PROJECT_ID)) return { data: null, error: null };
    return { data: { id: COMMAND_ID, project_id: PROJECT_ID, user_id: 'user-1' }, error: null };
  }
  if (call.table === 'user_infrastructure') {
    return { data: global.__workerInfraRows ?? [infraRow()], error: null };
  }
  return { data: null, error: null };
}

async function buildWorkerApp() {
  installFakeSupabase(handler);
  const Fastify = require('fastify');
  const app = Fastify({ logger: false });
  const { animeRequestIdHook } = H.dist('modules/anime/middleware/request-id.js');
  const { animeErrorHandler } = H.dist('modules/anime/errors/anime.errors.js');
  const { registerAnimeWorkflowWorkerRoutes } = H.dist('modules/anime/internal/workflowWorker.routes.js');
  const { clearGatewayNonceCacheForTests } = H.dist('modules/anime/internal/workflowGateway.auth.js');
  clearGatewayNonceCacheForTests();
  app.addHook('onRequest', animeRequestIdHook);
  app.setErrorHandler(animeErrorHandler);
  await app.register(registerAnimeWorkflowWorkerRoutes);
  await app.ready();
  return app;
}

function headers(nonce, extra = {}) {
  return { 'x-anime-workflow-token': TOKEN, 'x-anime-timestamp': String(Date.now()), 'x-anime-nonce': nonce, ...extra };
}

function body(path = '/v1/tts/svara', extra = {}) {
  return {
    worker_kind: 'cpu',
    path,
    body: { project_id: PROJECT_ID, episode_no: 1, scene_order: 1, voice_text: 'hello' },
    command_id: COMMAND_ID,
    project_id: PROJECT_ID,
    ...extra,
  };
}

test('worker gateway rejects missing tokens and disallowed paths', async () => {
  const app = await buildWorkerApp();
  const missing = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/worker', payload: body() });
  assert.equal(missing.statusCode, 401);
  const disallowed = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/worker', headers: headers('w1'), payload: body('/v1/generate-image') });
  assert.equal(disallowed.statusCode, 401);
  await app.close();
});

test('worker gateway mints a scoped token and proxies the CPU worker', async () => {
  const app = await buildWorkerApp();
  const { verifyWorkerJobToken } = H.dist('modules/anime/workers/workerToken.js');
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ ok: true, audio_url: 'https://cdn.test/a.mp3' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const response = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/worker', headers: headers('w2'), payload: body() });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true, audio_url: 'https://cdn.test/a.mp3' });
    assert.equal(captured.url, 'https://worker.example.com/v1/tts/svara');
    assert.equal(captured.init.method, 'POST');
    const auth = captured.init.headers.Authorization;
    assert.match(auth, /^Bearer /);
    const claims = verifyWorkerJobToken(auth.slice('Bearer '.length), 'tts');
    assert.equal(claims.job_id, COMMAND_ID);
    assert.equal(claims.project_id, PROJECT_ID);
    assert.equal(claims.user_id, 'user-1');
    const workerBody = JSON.parse(captured.init.body);
    assert.equal(workerBody.job_id, COMMAND_ID);
    assert.equal(workerBody.project_id, PROJECT_ID);
    assert.equal(workerBody.user_id, 'user-1');
    assert.equal(workerBody.voice_text, 'hello');
  } finally {
    global.fetch = originalFetch;
    await app.close();
  }
});

test('worker gateway uses the ffmpeg scope for render requests', async () => {
  const app = await buildWorkerApp();
  const { verifyWorkerJobToken } = H.dist('modules/anime/workers/workerToken.js');
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, init) => {
    captured = { url, init };
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const response = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/worker', headers: headers('w3'), payload: body('/v1/ffmpeg/render-episode') });
    assert.equal(response.statusCode, 200);
    assert.equal(captured.url, 'https://worker.example.com/v1/ffmpeg/render-episode');
    const claims = verifyWorkerJobToken(captured.init.headers.Authorization.slice('Bearer '.length), 'ffmpeg');
    assert.equal(claims.job_id, COMMAND_ID);
  } finally {
    global.fetch = originalFetch;
    await app.close();
  }
});

test('worker gateway rejects project mismatches and missing worker configuration', async () => {
  global.__workerInfraRows = [infraRow()];
  const app = await buildWorkerApp();
  const mismatch = await app.inject({
    method: 'POST',
    url: '/v1/anime/internal/workflow/worker',
    headers: headers('w4'),
    payload: { ...body(), project_id: '22222222-2222-4222-8222-222222222222' },
  });
  assert.equal(mismatch.statusCode, 403);
  await app.close();

  global.__workerInfraRows = [];
  const app2 = await buildWorkerApp();
  const noWorker = await app2.inject({ method: 'POST', url: '/v1/anime/internal/workflow/worker', headers: headers('w5'), payload: body() });
  assert.equal(noWorker.statusCode, 503);
  await app2.close();
  global.__workerInfraRows = undefined;
});

test('worker gateway rejects insecure or link-local worker URLs', async () => {
  const urls = ['http://worker.example.com', 'http://169.254.169.254', 'https://169.254.169.254'];
  for (const [index, workerUrl] of urls.entries()) {
    global.__workerInfraRows = [{
      ...infraRow(),
      config_encrypted: encryptConfig(JSON.stringify({ github_worker: { worker_url: workerUrl } }), process.env.ANIME_ENCRYPTION_KEY),
    }];
    const app = await buildWorkerApp();
    const response = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/worker', headers: headers(`w6-${index}`), payload: body() });
    assert.equal(response.statusCode, 401, workerUrl);
    await app.close();
  }
  global.__workerInfraRows = undefined;
});
