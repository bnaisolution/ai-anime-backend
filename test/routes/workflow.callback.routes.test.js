'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const COMMAND_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = process.env.ANIME_WORKFLOW_GATEWAY_TOKEN;
const SYSTEM_TOKEN = process.env.ANIME_WORKFLOW_SYSTEM_TOKEN;

function handler(call) {
  if (call.table === 'api_commands') {
    if (call.filters.some((filter) => filter.col === 'project_id' && filter.value !== PROJECT_ID)) return { data: null, error: null };
    return { data: { id: COMMAND_ID, project_id: PROJECT_ID, user_id: 'user-1' }, error: null };
  }
  if (call.table === 'callback_inbox' && call.action === 'insert') {
    return { data: { id: 'cb-1', ...call.payload }, error: null };
  }
  return { data: null, error: null };
}

async function buildCallbackApp() {
  const fake = installFakeSupabase(handler);
  const Fastify = require('fastify');
  const app = Fastify({ logger: false });
  const { animeRequestIdHook } = H.dist('modules/anime/middleware/request-id.js');
  const { animeErrorHandler } = H.dist('modules/anime/errors/anime.errors.js');
  const { registerAnimeWorkflowCallbackRoutes } = H.dist('modules/anime/internal/workflowCallback.routes.js');
  const { clearGatewayNonceCacheForTests } = H.dist('modules/anime/internal/workflowGateway.auth.js');
  clearGatewayNonceCacheForTests();
  app.addHook('onRequest', animeRequestIdHook);
  app.setErrorHandler(animeErrorHandler);
  await app.register(registerAnimeWorkflowCallbackRoutes);
  await app.ready();
  return { app, fake };
}

function headers(nonce, extra = {}) {
  return { 'x-anime-workflow-token': TOKEN, 'x-anime-timestamp': String(Date.now()), 'x-anime-nonce': nonce, ...extra };
}

function body(extra = {}) {
  return {
    command_id: COMMAND_ID,
    project_id: PROJECT_ID,
    wf_key: 'WF-02',
    status: 'COMPLETED',
    execution_id: 'exec-1',
    callback_id: 'exec-1:success',
    result: { episode_no: 1 },
    ...extra,
  };
}

test('callback gateway rejects missing and wrong tokens', async () => {
  const { app } = await buildCallbackApp();
  const missing = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/callback', payload: body() });
  assert.equal(missing.statusCode, 401);
  const wrong = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/callback', headers: headers('c1', { 'x-anime-workflow-token': 'wrong' }), payload: body() });
  assert.equal(wrong.statusCode, 401);
  await app.close();
});

test('callback gateway binds the project and enqueues reconciliation', async () => {
  const { app, fake } = await buildCallbackApp();
  const response = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/callback', headers: headers('c2'), payload: body() });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.accepted, true);
  assert.equal(response.json().data.duplicate, false);
  const outbox = fake.state.calls.find((call) => call.table === 'outbox_events' && call.action === 'insert');
  assert.ok(outbox, 'reconciliation outbox event inserted');
  assert.equal(outbox.payload.type, 'reconcile_command');
  assert.equal(outbox.payload.payload.project_id, PROJECT_ID);
  assert.equal(outbox.payload.payload.command_id, COMMAND_ID);
  await app.close();
});

test('callback gateway rejects a project mismatch', async () => {
  const { app } = await buildCallbackApp();
  const response = await app.inject({
    method: 'POST',
    url: '/v1/anime/internal/workflow/callback',
    headers: headers('c3'),
    payload: body({ project_id: '22222222-2222-4222-8222-222222222222' }),
  });
  assert.equal(response.statusCode, 403);
  await app.close();
});

test('system callbacks require a project id and use the system token', async () => {
  const { app } = await buildCallbackApp();
  const missingProject = await app.inject({
    method: 'POST',
    url: '/v1/anime/internal/workflow/callback',
    headers: headers('c4', { 'x-anime-workflow-token': '', 'x-anime-workflow-system-token': SYSTEM_TOKEN }),
    payload: { system_scope: true, wf_key: 'WF-13', status: 'FAILED' },
  });
  assert.equal(missingProject.statusCode, 401);
  const accepted = await app.inject({
    method: 'POST',
    url: '/v1/anime/internal/workflow/callback',
    headers: headers('c5', { 'x-anime-workflow-token': '', 'x-anime-workflow-system-token': SYSTEM_TOKEN }),
    payload: { system_scope: true, project_id: PROJECT_ID, wf_key: 'WF-13', status: 'FAILED', execution_id: 'exec-2', callback_id: 'exec-2:error' },
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.json().data.accepted, true);
  await app.close();
});
