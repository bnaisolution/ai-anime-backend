'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOpsApp, sign } = require('../helpers/ops-app');

const OWNER = { email: 'owner@test.invalid', sub: 'owner-1' };
const USER_A = { email: 'user-a@test.invalid', sub: 'user-a' };
const USER_B = { email: 'user-b@test.invalid', sub: 'user-b' };
const DB_SECRET = 'postgres://user:leak-me@db.internal';

function healthyHandler(call) {
  if (call.table === 'audit_events' && call.action === 'select') {
    return { data: call.mode === 'maybeSingle' ? { details: { version: '9.9.9', changelog: 'stable' }, created_at: '2026-11-07T00:00:00.000Z' } : [], error: null };
  }
  if (call.table === 'error_recovery_records' && call.action === 'select') {
    return { data: [], error: null, count: 2 };
  }
  if (call.table === 'error_recovery_records' && call.action === 'insert') {
    return { data: { id: 'crash-1' }, error: null };
  }
  if (call.table === 'audit_events' && call.action === 'insert') return { data: [], error: null };
  return { data: [], error: null };
}

async function withApp(handler, fn) {
  const { app, fake } = await buildOpsApp(handler);
  try {
    await fn(app, fake);
  } finally {
    await app.close();
  }
}

test('public system liveness exposes only minimal availability information', async () => {
  await withApp(healthyHandler, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/api/system/health/ping' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
  });
});

test('detailed health requires authentication', async () => {
  await withApp(healthyHandler, async (app) => {
    const response = await app.inject({ method: 'GET', url: '/api/system/health/detailed' });
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.includes('database'), false);
  });
});

test('detailed health rejects authenticated non-owner users, including spoofed identity headers', async () => {
  await withApp(healthyHandler, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/system/health/detailed',
      headers: {
        authorization: `Bearer ${sign(app, USER_A)}`,
        'x-user-id': 'owner-1',
        'x-role': 'owner_admin',
        'x-email': 'owner@test.invalid',
      },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.includes('database'), false);
  });
});

test('detailed health sanitizes database errors for the owner', async () => {
  const handler = (call) => {
    if (call.table === 'audit_events' && call.action === 'select') return { data: null, error: { message: DB_SECRET } };
    if (call.table === 'error_recovery_records' && call.action === 'select') return { data: [], error: null, count: 0 };
    return { data: [], error: null };
  };
  await withApp(handler, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/system/health/detailed',
      headers: { authorization: `Bearer ${sign(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 503);
    const body = response.json();
    assert.equal(body.checks.database.status, 'down');
    assert.equal(body.checks.database.error, undefined);
    assert.equal(response.body.includes('leak-me'), false);
    assert.equal(response.body.includes('db.internal'), false);
    assert.equal(response.body.includes('postgres'), false);
  });
});

test('detailed health is available to the owner when healthy', async () => {
  await withApp(healthyHandler, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/system/health/detailed',
      headers: { authorization: `Bearer ${sign(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.status, 'healthy');
    assert.equal(body.checks.database.status, 'up');
    assert.equal(body.checks.crash_rate.status, 'normal');
    assert.equal(body.checks.database.error, undefined);
  });
});

test('stable version requires authentication and does not leak database errors', async () => {
  const handler = (call) => {
    if (call.table === 'audit_events' && call.action === 'select') return { data: null, error: { message: DB_SECRET } };
    return { data: [], error: null };
  };
  await withApp(handler, async (app) => {
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/system/stable-version' });
    assert.equal(unauthenticated.statusCode, 401);

    const authenticated = await app.inject({
      method: 'GET',
      url: '/api/system/stable-version',
      headers: { authorization: `Bearer ${sign(app, USER_A)}` },
    });
    assert.equal(authenticated.statusCode, 503);
    assert.equal(authenticated.json().error, 'STABLE_VERSION_UNAVAILABLE');
    assert.equal(authenticated.body.includes('leak-me'), false);
  });
});

test('stable version is readable by an authenticated user', async () => {
  await withApp(healthyHandler, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/system/stable-version',
      headers: { authorization: `Bearer ${sign(app, USER_A)}` },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { version: '9.9.9', released_at: '2026-11-07T00:00:00.000Z', changelog: 'stable' });
  });
});

test('crash reports require authentication and never echo crash details', async () => {
  await withApp(healthyHandler, async (app) => {
    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/api/system/crash-report',
      payload: { error_type: 'TypeError', error_message: 'boom', stack_trace: 'sensitive-stack' },
    });
    assert.equal(unauthenticated.statusCode, 401);

    const authenticated = await app.inject({
      method: 'POST',
      url: '/api/system/crash-report',
      headers: { authorization: `Bearer ${sign(app, USER_A)}` },
      payload: { task_id: 'task-1', error_type: 'TypeError', error_message: 'boom', stack_trace: 'sensitive-stack' },
    });
    assert.equal(authenticated.statusCode, 200);
    assert.equal(authenticated.json().success, true);
    assert.equal(authenticated.json().record_id, 'crash-1');
    assert.equal(authenticated.body.includes('sensitive-stack'), false);
  });
});

test('crash report persistence errors are sanitized', async () => {
  const handler = (call) => {
    if (call.table === 'error_recovery_records' && call.action === 'insert') return { data: null, error: { message: DB_SECRET } };
    return { data: [], error: null };
  };
  await withApp(handler, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/system/crash-report',
      headers: { authorization: `Bearer ${sign(app, USER_A)}` },
      payload: { task_id: 'task-1', error_type: 'TypeError', error_message: 'boom' },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error, 'CRASH_REPORT_UNAVAILABLE');
    assert.equal(response.body.includes('leak-me'), false);
  });
});
