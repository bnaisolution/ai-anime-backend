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
  return { data: [], error: null };
}

async function buildGatewayApp() {
  installFakeSupabase(handler);
  const Fastify = require('fastify');
  const app = Fastify({ logger: false });
  const { animeRequestIdHook } = H.dist('modules/anime/middleware/request-id.js');
  const { animeErrorHandler } = H.dist('modules/anime/errors/anime.errors.js');
  const { registerAnimeWorkflowGatewayRoutes } = H.dist('modules/anime/internal/workflowGateway.routes.js');
  const { clearGatewayNonceCacheForTests } = H.dist('modules/anime/internal/workflowGateway.auth.js');
  clearGatewayNonceCacheForTests();
  app.addHook('onRequest', animeRequestIdHook);
  app.setErrorHandler(animeErrorHandler);
  await app.register(registerAnimeWorkflowGatewayRoutes);
  await app.ready();
  return app;
}

function headers(nonce, extra = {}) {
  return { 'x-anime-workflow-token': TOKEN, 'x-anime-timestamp': String(Date.now()), 'x-anime-nonce': nonce, ...extra };
}

function body(path = '/rest/v1/projects?select=id', extra = {}) {
  return { path, method: 'GET', command_id: COMMAND_ID, project_id: PROJECT_ID, ...extra };
}

test('gateway rejects missing and wrong tokens', async () => {
  const app = await buildGatewayApp();
  const missing = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/db', payload: body() });
  assert.equal(missing.statusCode, 401);
  const wrong = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/db', headers: headers('n1', { 'x-anime-workflow-token': 'wrong' }), payload: body() });
  assert.equal(wrong.statusCode, 401);
  await app.close();
});

test('gateway proxies a scoped request with the project filter injected', async () => {
  const app = await buildGatewayApp();
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify([{ id: 'row' }]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const response = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/db', headers: headers('n2'), payload: body() });
    assert.equal(response.statusCode, 200);
    assert.match(captured.url, new RegExp(`(?:project_id|id)=eq\\.${PROJECT_ID}`));
    assert.equal(captured.init.method, 'GET');
  } finally {
    global.fetch = originalFetch;
    await app.close();
  }
});

test('gateway rejects project mismatches, disallowed tables, and replay', async () => {
  const app = await buildGatewayApp();
  const mismatch = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/db', headers: headers('n3'), payload: { ...body(), project_id: '22222222-2222-4222-8222-222222222222' } });
  assert.equal(mismatch.statusCode, 403);
  const disallowed = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/db', headers: headers('n4'), payload: body('/rest/v1/secrets') });
  assert.equal(disallowed.statusCode, 401);
  const first = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/db', headers: headers('n5'), payload: body() });
  assert.notEqual(first.statusCode, 409);
  const replay = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/db', headers: headers('n5'), payload: body() });
  assert.equal(replay.statusCode, 409);
  await app.close();
});

test('system token cannot read project tables and project token cannot read system tables', async () => {
  const app = await buildGatewayApp();
  const systemOnProject = await app.inject({
    method: 'POST',
    url: '/v1/anime/internal/workflow/db',
    headers: headers('n6', { 'x-anime-workflow-token': '', 'x-anime-workflow-system-token': SYSTEM_TOKEN }),
    payload: { ...body(), system_scope: true },
  });
  assert.equal(systemOnProject.statusCode, 401);
  const projectOnSystem = await app.inject({
    method: 'POST',
    url: '/v1/anime/internal/workflow/db',
    headers: headers('n7'),
    payload: { ...body('/rest/v1/episode_states?current_state=eq.FAILED'), system_scope: true },
  });
  assert.equal(projectOnSystem.statusCode, 401);
  await app.close();
});

test('LLM gateway batches long-episode scene requests and renumbers merged scenes', async () => {
  const app = await buildGatewayApp();
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const content = JSON.stringify({ scenes: [{ scene_order: 1, voice_text: 'a' }, { scene_order: 1, voice_text: 'b' }] });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const payload = {
      provider: 'groq',
      path: '/openai/v1/chat/completions',
      batch: [
        { provider: 'groq', path: '/openai/v1/chat/completions', body: { model: 'm', messages: [{ role: 'user', content: 'act 1' }] } },
        { provider: 'groq', path: '/openai/v1/chat/completions', body: { model: 'm', messages: [{ role: 'user', content: 'act 2' }] } },
      ],
      command_id: COMMAND_ID,
      project_id: PROJECT_ID,
    };
    const response = await app.inject({ method: 'POST', url: '/v1/anime/internal/workflow/llm', headers: headers('n8'), payload });
    assert.equal(response.statusCode, 200);
    assert.equal(calls.length, 2);
    const out = JSON.parse(response.payload);
    assert.equal(out.batch.count, 2);
    const merged = JSON.parse(out.choices[0].message.content);
    assert.equal(merged.scenes.length, 4);
    assert.deepEqual(merged.scenes.map((scene) => scene.scene_order), [1, 2, 3, 4]);
  } finally {
    global.fetch = originalFetch;
    await app.close();
  }
});
