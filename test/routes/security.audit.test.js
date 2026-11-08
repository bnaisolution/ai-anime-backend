'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

function requireDefault(relativePath) {
  const mod = H.dist(relativePath);
  return mod && mod.default ? mod.default : mod;
}

async function buildApp(registerRoute, prefix, supabaseHandler) {
  const Fastify = require('fastify');
  const app = Fastify({ logger: false });
  const fake = installFakeSupabase(supabaseHandler || (() => ({ data: [], error: null })));
  app.decorate('supabase', fake.client);
  await app.register(requireDefault('plugins/auth.js'));
  await app.register(registerRoute, { prefix });
  await app.ready();
  return { app, fake };
}

function token(app, overrides = {}) {
  return app.jwt.sign({
    sub: 'user-1',
    workspace_id: 'ws-1',
    email: 'user@test.invalid',
    role: 'normal_user',
    ...overrides,
  });
}

test('file deletion is scoped to the caller workspace', async (t) => {
  const { app, fake } = await buildApp(requireDefault('modules/files/files.routes.js'), '/api/v1/files');
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/files/delete',
    headers: { authorization: `Bearer ${token(app)}` },
    payload: { artifact_id: 'artifact-1' },
  });

  assert.equal(response.statusCode, 200);
  const deleteCall = fake.state.calls.find((call) => call.table === 'versioned_artifacts' && call.action === 'delete');
  assert.ok(deleteCall);
  assert.equal(deleteCall.filters.some((filter) => filter.col === 'id' && filter.value === 'artifact-1'), true);
  assert.equal(deleteCall.filters.some((filter) => filter.col === 'workspace_id' && filter.value === 'ws-1'), true);
});

test('file deletion without a workspace scope is rejected before touching storage', async (t) => {
  const { app, fake } = await buildApp(requireDefault('modules/files/files.routes.js'), '/api/v1/files');
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/files/delete',
    headers: { authorization: `Bearer ${token(app, { workspace_id: undefined })}` },
    payload: { artifact_id: 'artifact-1' },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(fake.state.calls.some((call) => call.table === 'versioned_artifacts' && call.action === 'delete'), false);
});

test('normal users cannot deploy n8n workflows', async (t) => {
  const { app } = await buildApp(requireDefault('modules/n8n/n8n.routes.js'), '/api/v1/n8n');
  t.after(() => app.close());

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ id: 'wf-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { global.fetch = originalFetch; });

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/n8n/deploy-workflow',
    headers: { authorization: `Bearer ${token(app)}` },
    payload: { workflow_json: { name: 'x', nodes: [], connections: {} } },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(fetchCalls, 0);
});

test('owner deployment requires an explicit n8n API key and has no bundled fallback', async (t) => {
  const { app } = await buildApp(requireDefault('modules/n8n/n8n.routes.js'), '/api/v1/n8n');
  t.after(() => app.close());

  const originalKey = process.env.WF09_N8N_API_KEY;
  delete process.env.WF09_N8N_API_KEY;
  t.after(() => {
    if (originalKey === undefined) delete process.env.WF09_N8N_API_KEY;
    else process.env.WF09_N8N_API_KEY = originalKey;
  });

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ id: 'wf-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { global.fetch = originalFetch; });

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/n8n/deploy-workflow',
    headers: { authorization: `Bearer ${token(app, { email: 'owner@test.invalid', role: 'owner_admin' })}` },
    payload: { workflow_json: { name: 'x', nodes: [], connections: {} } },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, 'N8N_API_KEY_NOT_CONFIGURED');
  assert.equal(fetchCalls, 0);
});

test('owner deployment uses the configured n8n API key', async (t) => {
  const { app } = await buildApp(requireDefault('modules/n8n/n8n.routes.js'), '/api/v1/n8n');
  t.after(() => app.close());

  const originalKey = process.env.WF09_N8N_API_KEY;
  process.env.WF09_N8N_API_KEY = 'stage4-test-n8n-key';
  t.after(() => {
    if (originalKey === undefined) delete process.env.WF09_N8N_API_KEY;
    else process.env.WF09_N8N_API_KEY = originalKey;
  });

  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ id: 'wf-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { global.fetch = originalFetch; });

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/n8n/deploy-workflow',
    headers: { authorization: `Bearer ${token(app, { email: 'owner@test.invalid', role: 'owner_admin' })}` },
    payload: { workflow_json: { name: 'x', nodes: [], connections: {} } },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers['X-N8N-API-KEY'], 'stage4-test-n8n-key');
  assert.equal(requests[1].options.headers['X-N8N-API-KEY'], 'stage4-test-n8n-key');
});
