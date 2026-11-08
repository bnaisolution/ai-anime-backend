'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const { buildApp, signFor } = require('../helpers/app');

const OWNER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';

function makeHandler() {
  return async (call) => {
    if (call.table === 'token_blacklist') return { data: null, error: null };
    if (call.table === 'api_commands' && call.action === 'select') return { data: null, error: null };
    if (call.table === 'projects' && call.action === 'select') {
      return { data: { id: PROJECT, user_id: OWNER }, error: null };
    }
    if (call.table === 'api_commands' && call.action === 'insert') {
      return { data: { id: call.payload.id, ...call.payload }, error: null };
    }
    if (call.table === 'outbox_events' && call.action === 'insert') {
      return { data: call.payload, error: null };
    }
    if (call.action === 'select') return { data: [], error: null };
    if (call.action === 'insert') return { data: call.payload, error: null };
    return { data: null, error: null };
  };
}

async function withApp(rpcHandler, fn) {
  const { app, fake } = await buildApp({
    supabaseHandler: makeHandler(),
    rpcHandler,
  });
  try {
    await fn(app, fake);
  } finally {
    await app.close();
  }
}

test('health endpoint reports database status and returns X-Request-Id', async () => {
  await withApp(null, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/v1/anime/health' });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.ok, true);
    assert.equal(body.db, 'up');
    assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/);
  });
});

test('command submission rejects a request without authentication', async () => {
  await withApp(null, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/commands',
      headers: { 'idempotency-key': 'idem-no-auth' },
      payload: { intent: 'CREATE_PROJECT', project_id: PROJECT, payload: { name: 'X' } },
    });
    assert.ok([401, 403].includes(response.statusCode), `expected 401/403, got ${response.statusCode}`);
  });
});

test('valid command submission returns 202 with command id and mapped workflow', async () => {
  const commandId = '66666666-6666-4666-8666-666666666666';
  const rpcHandler = (name, args) => {
    assert.equal(name, 'insert_anime_command_atomic');
    return {
      data: {
        id: args.p_command_id,
        project_id: args.p_project_id,
        user_id: args.p_user_id,
        intent: args.p_intent,
        status: args.p_status,
        idempotency_key: args.p_idempotency_key,
        body_hash: args.p_body_hash,
        payload: args.p_payload,
        created_at: '2026-11-07T00:00:00.000Z',
      },
      error: null,
    };
  };
  await withApp(rpcHandler, async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/commands',
      headers: {
        authorization: `Bearer ${signFor(app, OWNER)}`,
        'idempotency-key': `idem-${Date.now()}`,
      },
      payload: { intent: 'CREATE_PROJECT', project_id: PROJECT, payload: { name: 'Command Test' } },
    });
    assert.equal(response.statusCode, 202);
    const body = response.json();
    assert.equal(body.data.wf_key, 'WF-01');
    assert.match(body.data.command.id, /^[0-9a-f-]{36}$/);
    assert.notEqual(body.data.command.id, commandId);
    assert.equal(fake.state.rpcCalls.length, 1);
  });
});
