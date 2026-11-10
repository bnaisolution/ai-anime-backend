'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const { buildApp, signFor } = require('../helpers/app');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const MEMORY = '44444444-4444-4444-8444-444444444444';

function auth(app, userId = OWNER) {
  return { authorization: `Bearer ${signFor(app, userId)}` };
}

function makeHandler(overrides = {}) {
  return async (call) => {
    if (call.table === 'token_blacklist') return { data: null, error: null };
    if (overrides[call.table]) return overrides[call.table](call);
    if (call.table === 'memory_items' && call.action === 'select') {
      return { data: [{ id: MEMORY, owner_id: OWNER, project_id: PROJECT, scope: 'project', content: 'Aki has silver hair', knowledge_status: 'observed' }], error: null };
    }
    if (call.action === 'insert') return { data: { id: MEMORY, ...call.payload }, error: null };
    if (call.action === 'update') return { data: { id: MEMORY, ...call.payload }, error: null };
    if (call.action === 'delete') return { data: null, error: null };
    return { data: [], error: null };
  };
}

async function withApp(fn, overrides) {
  const { app, fake } = await buildApp({ supabaseHandler: makeHandler(overrides) });
  try {
    await fn(app, fake);
  } finally {
    await app.close();
  }
}

test('memory read is owner scoped and filters superseded rows', async () => {
  await withApp(async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/memory/read',
      headers: auth(app),
      payload: { project_id: PROJECT, scope: 'project', query: 'silver' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'completed');
    const call = fake.state.calls.find((entry) => entry.table === 'memory_items' && entry.action === 'select');
    assert.ok(call);
    assert.ok(call.filters.some((filter) => filter.op === 'eq' && filter.col === 'owner_id' && filter.value === OWNER));
    assert.ok(call.filters.some((filter) => filter.op === 'neq' && filter.col === 'knowledge_status' && filter.value === 'superseded'));
    assert.ok(call.filters.some((filter) => filter.op === 'eq' && filter.col === 'project_id' && filter.value === PROJECT));
    assert.ok(call.filters.some((filter) => filter.op === 'eq' && filter.col === 'scope' && filter.value === 'project'));
    assert.ok(call.filters.some((filter) => filter.op === 'ilike' && filter.col === 'content' && filter.value === '%silver%'));
  });
});

test('memory write deduplicates identical owner scoped content', async () => {
  await withApp(async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/memory/write',
      headers: auth(app),
      payload: { project_id: PROJECT, scope: 'project', content: 'Aki has silver hair' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().deduplicated, true);
    assert.equal(fake.state.calls.some((entry) => entry.table === 'memory_items' && entry.action === 'insert'), false);
    const dedupCall = fake.state.calls.find((entry) => entry.table === 'memory_items' && entry.action === 'select');
    assert.ok(dedupCall.filters.some((filter) => filter.op === 'eq' && filter.col === 'owner_id' && filter.value === OWNER));
    assert.ok(dedupCall.filters.some((filter) => filter.op === 'eq' && filter.col === 'content' && filter.value === 'Aki has silver hair'));
  });
});

test('memory correction only updates rows owned by the caller', async () => {
  await withApp(async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/memory/correct',
      headers: auth(app, OTHER),
      payload: { memory_id: MEMORY, content: 'Aki has white hair' },
    });
    assert.equal(response.statusCode, 200);
    const call = fake.state.calls.find((entry) => entry.table === 'memory_items' && entry.action === 'update');
    assert.ok(call);
    assert.equal(call.payload.knowledge_status, 'corrected');
    assert.ok(call.filters.some((filter) => filter.op === 'eq' && filter.col === 'owner_id' && filter.value === OTHER));
    assert.ok(call.filters.some((filter) => filter.op === 'eq' && filter.col === 'id' && filter.value === MEMORY));
  });
});

test('memory deletion requires a selector and records a deletion job', async () => {
  await withApp(async (app, fake) => {
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/memory/delete',
      headers: auth(app),
      payload: {},
    });
    assert.equal(missing.statusCode, 200);
    assert.equal(missing.json().status, 'failed');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/memory/delete',
      headers: auth(app),
      payload: { project_id: PROJECT },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().deleted_project_id, PROJECT);
    const deleteCall = fake.state.calls.find((entry) => entry.table === 'memory_items' && entry.action === 'delete');
    assert.ok(deleteCall.filters.some((filter) => filter.op === 'eq' && filter.col === 'owner_id' && filter.value === OWNER));
    assert.ok(deleteCall.filters.some((filter) => filter.op === 'eq' && filter.col === 'project_id' && filter.value === PROJECT));
    const jobCall = fake.state.calls.find((entry) => entry.table === 'data_jobs' && entry.action === 'insert');
    assert.equal(jobCall.payload.job_type, 'memory_deletion');
  });
});

test('memory reconciliation reports scope and status counts', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/memory/reconcile',
      headers: auth(app),
      payload: { project_id: PROJECT },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.status, 'completed');
    assert.equal(body.total, 1);
    assert.equal(body.by_scope.project, 1);
    assert.equal(body.by_status.observed, 1);
  });
});
