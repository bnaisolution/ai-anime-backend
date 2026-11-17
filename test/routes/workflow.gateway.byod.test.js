'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const COMMAND_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = '44444444-4444-4444-8444-444444444444';
const TOKEN = process.env.ANIME_WORKFLOW_GATEWAY_TOKEN;
const SYSTEM_TOKEN = process.env.ANIME_WORKFLOW_SYSTEM_TOKEN;

const tenantService = H.dist('modules/anime/tenant/tenantDatabase.service.js');
const tenantGateway = H.dist('modules/anime/internal/workflowGateway.tenantDb.js');

const byodA = { tenant_id: TENANT_ID, mode: 'byod', provider: 'postgres', central: false, dsn: 'postgresql://u:p@a.example.com:5432/a?sslmode=require' };
const byodB = { tenant_id: '55555555-5555-4555-8555-555555555555', mode: 'byod', provider: 'postgres', central: false, dsn: 'postgresql://u:p@b.example.com:5432/b?sslmode=require' };
const central = { tenant_id: '', mode: 'central', provider: 'platform', central: true, dsn: null };

function handler(call) {
  if (call.table === 'api_commands') {
    return { data: { id: COMMAND_ID, project_id: PROJECT_ID, user_id: 'user-1' }, error: null };
  }
  return { data: [], error: null };
}

function headers(nonce, extra = {}) {
  return { 'x-anime-workflow-token': TOKEN, 'x-anime-timestamp': String(Date.now()), 'x-anime-nonce': nonce, ...extra };
}

function systemHeaders(nonce) {
  return headers(nonce, { 'x-anime-workflow-token': '', 'x-anime-workflow-system-token': SYSTEM_TOKEN });
}

function body(path, extra = {}) {
  return { path, method: 'GET', command_id: COMMAND_ID, project_id: PROJECT_ID, ...extra };
}

async function buildGatewayApp() {
  installFakeSupabase(handler);
  tenantService.resolveProjectDataPlaneById = async (projectId) => {
    if (projectId === PROJECT_ID) return byodA;
    if (projectId === OTHER_PROJECT_ID) return byodB;
    return central;
  };
  tenantService.listActiveByodDataPlanes = async () => [byodA, byodB];

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

function installTenantClient(rowsByDsn = {}) {
  const calls = [];
  tenantGateway.setTenantDbClientFactoryForTests((dsn) => ({
    async connect() {},
    async query(text, values) {
      calls.push({ dsn, text, values });
      return { rows: rowsByDsn[dsn] ?? [], rowCount: (rowsByDsn[dsn] ?? []).length };
    },
    async end() {},
  }));
  return calls;
}

test('project gateway reads from the BYOD data plane without central fallback', async () => {
  const app = await buildGatewayApp();
  const calls = installTenantClient({ [byodA.dsn]: [{ id: 'byod-row' }] });
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('central fetch should not run'); };
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/internal/workflow/db',
      headers: headers('byod-n1'),
      payload: body('/rest/v1/projects?select=id'),
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), [{ id: 'byod-row' }]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].dsn, byodA.dsn);
    assert.match(calls[0].text, /from "anime_data"\."projects"/);
    assert.deepEqual(calls[0].values, [PROJECT_ID]);
  } finally {
    global.fetch = originalFetch;
    tenantGateway.setTenantDbClientFactoryForTests(null);
    await app.close();
  }
});

test('global catalog reads remain on the central database', async () => {
  const app = await buildGatewayApp();
  const calls = installTenantClient();
  const originalFetch = global.fetch;
  let fetched = false;
  global.fetch = async () => {
    fetched = true;
    return new Response(JSON.stringify([{ id: 'central-voice' }]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/internal/workflow/db',
      headers: headers('byod-n2'),
      payload: body('/rest/v1/voice_catalog?select=id'),
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), [{ id: 'central-voice' }]);
    assert.equal(fetched, true);
    assert.equal(calls.length, 0);
  } finally {
    global.fetch = originalFetch;
    tenantGateway.setTenantDbClientFactoryForTests(null);
    await app.close();
  }
});

test('system reads fan out across central and BYOD planes', async () => {
  const app = await buildGatewayApp();
  const calls = installTenantClient({
    [byodA.dsn]: [{ id: 'a', updated_at: '2026-11-16T01:00:00Z' }],
    [byodB.dsn]: [{ id: 'b', updated_at: '2026-11-16T04:00:00Z' }],
  });
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify([{ id: 'c', updated_at: '2026-11-16T03:00:00Z' }]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/internal/workflow/db',
      headers: systemHeaders('byod-n3'),
      payload: {
        path: '/rest/v1/episode_states?select=id,updated_at&order=updated_at.asc&limit=2',
        method: 'GET',
        body: null,
        prefer: null,
        system_scope: true,
      },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().map((row) => row.id), ['a', 'c']);
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = originalFetch;
    tenantGateway.setTenantDbClientFactoryForTests(null);
    await app.close();
  }
});

test('system writes route each row to its project data plane', async () => {
  const app = await buildGatewayApp();
  const calls = installTenantClient();
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('central fetch should not run'); };
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/internal/workflow/db',
      headers: systemHeaders('byod-n4'),
      payload: {
        path: '/rest/v1/pending_actions',
        method: 'POST',
        body: [
          { project_id: PROJECT_ID, action_type: 'A', status: 'PENDING' },
          { project_id: OTHER_PROJECT_ID, action_type: 'B', status: 'PENDING' },
        ],
        prefer: 'return=minimal',
        system_scope: true,
      },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((call) => call.dsn).sort(), [byodA.dsn, byodB.dsn].sort());
    assert.ok(calls.every((call) => call.text.startsWith('insert into "anime_data"."pending_actions"')));
  } finally {
    global.fetch = originalFetch;
    tenantGateway.setTenantDbClientFactoryForTests(null);
    await app.close();
  }
});
