'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

function requireDefault(relativePath) {
  const mod = H.dist(relativePath);
  return mod && mod.default ? mod.default : mod;
}

async function buildSharedN8nApp() {
  const Fastify = require('fastify');
  const app = Fastify({ logger: false });
  const fake = installFakeSupabase(() => ({ data: [], error: null }));
  app.decorate('supabase', fake.client);
  await app.register(requireDefault('plugins/auth.js'));
  await app.register(requireDefault('modules/n8n/n8n.routes.js'), { prefix: '/api/v1/n8n' });
  await app.ready();
  return { app };
}

function ownerToken(app) {
  return app.jwt.sign({ sub: 'owner-1', workspace_id: 'ws-1', email: 'owner@test.invalid', role: 'normal_user' });
}

test('shared n8n deploy route rejects Anime workflow payloads', async (t) => {
  const { app } = await buildSharedN8nApp();
  t.after(() => app.close());
  const originalKey = process.env.WF09_N8N_API_KEY;
  process.env.WF09_N8N_API_KEY = 'stage4-test-n8n-key';
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ id: 'wf-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.WF09_N8N_API_KEY;
    else process.env.WF09_N8N_API_KEY = originalKey;
  });

  const byName = await app.inject({
    method: 'POST',
    url: '/api/v1/n8n/deploy-workflow',
    headers: { authorization: `Bearer ${ownerToken(app)}` },
    payload: { workflow_json: { name: 'StoryWF-00_Main_Router', nodes: [], connections: {} } },
  });
  assert.equal(byName.statusCode, 403);
  assert.equal(byName.json().error, 'ANIME_WORKFLOW_USE_DEDICATED_ROUTE');

  const byId = await app.inject({
    method: 'POST',
    url: '/api/v1/n8n/deploy-workflow',
    headers: { authorization: `Bearer ${ownerToken(app)}` },
    payload: { workflow_json: { name: 'Renamed', id: 'U4pLz7pXmG2OqXlt', nodes: [], connections: {} } },
  });
  assert.equal(byId.statusCode, 403);
  assert.equal(fetchCalls, 0);
});

test('shared n8n deploy route still serves non-Anime workflows', async (t) => {
  const { app } = await buildSharedN8nApp();
  t.after(() => app.close());
  const originalKey = process.env.WF09_N8N_API_KEY;
  process.env.WF09_N8N_API_KEY = 'stage4-test-n8n-key';
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ id: 'wf-assistant' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.WF09_N8N_API_KEY;
    else process.env.WF09_N8N_API_KEY = originalKey;
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/n8n/deploy-workflow',
    headers: { authorization: `Bearer ${ownerToken(app)}` },
    payload: { workflow_json: { name: 'Assistant Workflow', nodes: [], connections: {} } },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(fetchCalls, 2);
});

test('Anime admin workflow routes are owner-only and registry-bound', async (t) => {
  const { buildApp, signFor } = require('../helpers/app');
  const { app } = await buildApp();
  t.after(() => app.close());
  const owner = signFor(app, 'owner-1', { email: 'owner@test.invalid' });
  const normal = signFor(app, 'user-1', { email: 'user@test.invalid' });

  const originalKey = process.env.WF09_N8N_API_KEY;
  process.env.WF09_N8N_API_KEY = 'stage4-test-n8n-key';
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify({ id: 'U4pLz7pXmG2OqXlt' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.WF09_N8N_API_KEY;
    else process.env.WF09_N8N_API_KEY = originalKey;
  });

  const registry = await app.inject({
    method: 'GET',
    url: '/v1/anime/admin/workflows/registry',
    headers: { authorization: `Bearer ${owner}` },
  });
  assert.equal(registry.statusCode, 200);
  assert.equal(registry.json().data.length, 14);

  const forbidden = await app.inject({
    method: 'POST',
    url: '/v1/anime/admin/workflows/deploy',
    headers: { authorization: `Bearer ${normal}` },
    payload: { workflow_key: 'WF-00' },
  });
  assert.equal(forbidden.statusCode, 403);

  const deploy = await app.inject({
    method: 'POST',
    url: '/v1/anime/admin/workflows/deploy',
    headers: { authorization: `Bearer ${owner}` },
    payload: { workflow_key: 'WF-00' },
  });
  assert.equal(deploy.statusCode, 200);
  assert.equal(deploy.json().action, 'updated');
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/api\/v1\/workflows\/U4pLz7pXmG2OqXlt$/);
  assert.equal(requests[0].options.method, 'PUT');
  const deployed = JSON.parse(requests[0].options.body);
  assert.equal(deployed.name, 'StoryWF-00_Main_Router');
  assert.ok(Array.isArray(deployed.nodes) && deployed.nodes.length > 0);
  assert.equal(Object.prototype.hasOwnProperty.call(deployed, 'active'), false);

  const unknown = await app.inject({
    method: 'POST',
    url: '/v1/anime/admin/workflows/deploy',
    headers: { authorization: `Bearer ${owner}` },
    payload: { workflow_key: 'WF-14' },
  });
  assert.equal(unknown.statusCode, 404);
  assert.equal(requests.length, 1);

  const activate = await app.inject({
    method: 'POST',
    url: '/v1/anime/admin/workflows/activate',
    headers: { authorization: `Bearer ${owner}` },
    payload: { workflow_key: 'WF-00' },
  });
  assert.equal(activate.statusCode, 200);
  assert.match(requests[1].url, /\/api\/v1\/workflows\/U4pLz7pXmG2OqXlt\/activate$/);
  assert.equal(requests[1].options.method, 'POST');
});
