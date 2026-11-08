'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const { buildApp, signFor } = require('../helpers/app');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';

function makeHandler(options = {}) {
  const owner = options.owner ?? OWNER;
  const exists = options.exists !== false;
  return async (call) => {
    if (call.table === 'token_blacklist') return { data: null, error: null };
    if (call.table === 'projects' && call.action === 'select') {
      const idFilter = call.filters.find((filter) => filter.op === 'eq' && filter.col === 'id');
      const matchesId = !idFilter || idFilter.value === PROJECT;
      const row = exists && matchesId ? { id: PROJECT, user_id: owner, name: 'P', story_bible: { budget_ceiling: 1000 } } : null;
      if (call.mode === 'maybeSingle' || call.mode === 'single') return { data: row, error: null };
      return { data: row ? [row] : [], error: null };
    }
    if (call.table === 'quota_usage' && call.action === 'select') {
      return { data: [{ project_id: PROJECT, usage_date: '2026-11-07', accumulated_units: 42 }], error: null };
    }
    if (call.action === 'insert') {
      return { data: { id: '44444444-4444-4444-8444-444444444444', ...call.payload }, error: null };
    }
    if (call.action === 'update') {
      return { data: { id: PROJECT, ...call.payload }, error: null };
    }
    if (call.action === 'select') return { data: [], error: null };
    return { data: null, error: null };
  };
}

async function withApp(options, fn) {
  const { app, fake } = await buildApp({ includeLore: true, supabaseHandler: makeHandler(options) });
  try {
    await fn(app, fake);
  } finally {
    await app.close();
  }
}

test('Lore read route rejects an unauthenticated request', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({ method: 'GET', url: `/v1/anime/projects/${PROJECT}/quota` });
    assert.ok([401, 403].includes(response.statusCode), `expected 401/403, got ${response.statusCode}`);
  });
});

test('Lore read route rejects the all-zero project uuid', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/anime/projects/00000000-0000-0000-0000-000000000000/quota',
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'PROJECT_FORBIDDEN');
  });
});

test('Lore read route rejects cross-project access', async () => {
  await withApp({ owner: OTHER }, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/anime/projects/${PROJECT}/quota`,
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'PROJECT_FORBIDDEN');
  });
});

test('Lore quota returns a standard data envelope for the owner', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/anime/projects/${PROJECT}/quota`,
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.ok(body.data);
    assert.equal(body.data.project_id, PROJECT);
    assert.ok(Array.isArray(body.data.items));
  });
});

test('project creation stores the JWT subject and ignores a body user_id override', async () => {
  await withApp({}, async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/projects',
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
      payload: { name: 'Ownership Test', user_id: OTHER },
    });
    assert.ok([200, 201].includes(response.statusCode));
    const insert = fake.state.calls.find((call) => call.table === 'projects' && call.action === 'insert');
    assert.ok(insert, 'project insert was called');
    assert.equal(insert.payload.user_id, OWNER);
  });
});
