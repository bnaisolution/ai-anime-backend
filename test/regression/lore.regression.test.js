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
    if (call.table === 'projects' && call.action === 'select') {
      const idFilter = call.filters.find((filter) => filter.op === 'eq' && filter.col === 'id');
      const row = (!idFilter || idFilter.value === PROJECT)
        ? { id: PROJECT, user_id: OWNER, name: 'P', story_bible: { budget_ceiling: 1000 } }
        : null;
      if (call.mode === 'maybeSingle' || call.mode === 'single') return { data: row, error: null };
      return { data: row ? [row] : [], error: null };
    }
    if (call.action === 'insert') return { data: { id: '44444444-4444-4444-8444-444444444444', ...call.payload }, error: null };
    if (call.action === 'update') return { data: { id: PROJECT, ...call.payload }, error: null };
    if (call.action === 'select') return { data: [], error: null };
    return { data: null, error: null };
  };
}

async function withApp(fn) {
  const { app, fake } = await buildApp({ includeLore: true, supabaseHandler: makeHandler() });
  try {
    await fn(app, fake);
  } finally {
    await app.close();
  }
}

test('REGRESSION: malformed project uuid must return a client error, not 500', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/anime/projects/not-a-uuid/quota',
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.ok([400, 422].includes(response.statusCode), `expected 400/422, got ${response.statusCode}`);
  });
});

test('REGRESSION: project creation must return HTTP 201', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/projects',
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
      payload: { name: 'Created In Test' },
    });
    assert.equal(response.statusCode, 201);
    assert.match(response.json().data.id, /^[0-9a-f-]{36}$/);
  });
});

test('REGRESSION: project creation must reject x-user-id without a JWT', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/projects',
      headers: { 'x-user-id': OWNER },
      payload: { name: 'Header Identity' },
    });
    assert.ok([401, 403].includes(response.statusCode), `expected 401/403, got ${response.statusCode}`);
  });
});

test('REGRESSION: job cancel must use only columns present in the live schema', async () => {
  await withApp(async (app, fake) => {
    const jobId = '55555555-5555-4555-8555-555555555555';
    const response = await app.inject({
      method: 'POST',
      url: `/v1/anime/projects/${PROJECT}/jobs/${jobId}/cancel`,
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.ok([200, 201].includes(response.statusCode));
    const commandUpdate = fake.state.calls.find((call) => call.table === 'api_commands' && call.action === 'update');
    assert.ok(commandUpdate, 'api_commands update was called');
    assert.equal(Object.prototype.hasOwnProperty.call(commandUpdate.payload, 'error_message'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(commandUpdate.payload, 'updated_at'), false);
    const pendingUpdate = fake.state.calls.find((call) => call.table === 'pending_actions' && call.action === 'update');
    if (pendingUpdate) {
      const usesCommandId = pendingUpdate.filters.some((filter) => filter.col === 'command_id');
      assert.equal(usesCommandId, false, 'pending_actions has job_id, not command_id');
    }
  });
});
