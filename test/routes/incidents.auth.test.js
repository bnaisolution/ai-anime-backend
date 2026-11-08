'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOpsApp, sign } = require('../helpers/ops-app');

const OWNER = { email: 'owner@test.invalid', sub: 'owner-1' };
const USER_A = { email: 'user-a@test.invalid', sub: 'user-a' };
const USER_B = { email: 'user-b@test.invalid', sub: 'user-b' };
const INCIDENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INCIDENT_MISSING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function incidentHandler(call) {
  if (call.table !== 'error_recovery_records') return { data: [], error: null };
  const idFilter = call.filters.find((filter) => filter.col === 'id');
  const statusFilter = call.filters.find((filter) => filter.col === 'recovery_status');
  if (call.action === 'select') {
    if (call.mode === 'maybeSingle') {
      if (idFilter?.value === INCIDENT_MISSING) return { data: null, error: null };
      return { data: { id: idFilter?.value || INCIDENT_A, recovery_status: 'pending' }, error: null };
    }
    if (statusFilter?.op === 'eq' && statusFilter.value === 'pending') return { data: [], error: null, count: 1 };
    if (statusFilter?.op === 'eq' && statusFilter.value === 'resolved') return { data: [], error: null, count: 2 };
    if (statusFilter?.op === 'neq') {
      return { data: [{ id: INCIDENT_A, recovery_status: 'pending' }], error: null };
    }
    return { data: [], error: null, count: 3 };
  }
  if (call.action === 'update') {
    return { data: { id: idFilter?.value, recovery_status: 'resolved', resolved_at: call.payload.resolved_at }, error: null };
  }
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

test('incident list and acknowledge require authentication', async () => {
  await withApp(incidentHandler, async (app, fake) => {
    const list = await app.inject({ method: 'GET', url: '/api/incidents' });
    assert.equal(list.statusCode, 401);
    const ack = await app.inject({ method: 'POST', url: `/api/incidents/${INCIDENT_A}/acknowledge` });
    assert.equal(ack.statusCode, 401);
    assert.equal(fake.state.calls.length, 0);
  });
});

test('normal users cannot list incidents or infer another user incident', async () => {
  await withApp(incidentHandler, async (app, fake) => {
    const listA = await app.inject({
      method: 'GET',
      url: '/api/incidents',
      headers: { authorization: `Bearer ${sign(app, USER_A)}` },
    });
    const listB = await app.inject({
      method: 'GET',
      url: '/api/incidents',
      headers: { authorization: `Bearer ${sign(app, USER_B)}` },
    });
    assert.equal(listA.statusCode, 403);
    assert.equal(listB.statusCode, 403);
    assert.equal(fake.state.calls.length, 0);
  });
});

test('normal users cannot acknowledge an incident even when they know its id', async () => {
  await withApp(incidentHandler, async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/incidents/${INCIDENT_A}/acknowledge`,
      headers: { authorization: `Bearer ${sign(app, USER_B)}` },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(fake.state.calls.some((call) => call.action === 'update'), false);
  });
});

test('normal-user incident access is fail-closed because no safe ownership mapping exists', async () => {
  await withApp(incidentHandler, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/incidents/${INCIDENT_A}/acknowledge`,
      headers: { authorization: `Bearer ${sign(app, USER_A)}` },
    });
    assert.equal(response.statusCode, 403);
  });
});

test('owner/admin can list incidents', async () => {
  await withApp(incidentHandler, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/incidents',
      headers: { authorization: `Bearer ${sign(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), [{ id: INCIDENT_A, recovery_status: 'pending' }]);
  });
});

test('owner/admin acknowledge verifies the incident exists before updating', async () => {
  await withApp(incidentHandler, async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/incidents/${INCIDENT_A}/acknowledge`,
      headers: { authorization: `Bearer ${sign(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().success, true);
    const update = fake.state.calls.find((call) => call.action === 'update');
    assert.ok(update);
    assert.equal(update.filters.some((filter) => filter.col === 'id' && filter.value === INCIDENT_A), true);
    assert.equal(update.payload.recovery_status, 'resolved');
  });
});

test('owner/admin acknowledge returns 404 and does not update a nonexistent incident', async () => {
  await withApp(incidentHandler, async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/incidents/${INCIDENT_MISSING}/acknowledge`,
      headers: { authorization: `Bearer ${sign(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error, 'INCIDENT_NOT_FOUND');
    assert.equal(fake.state.calls.some((call) => call.action === 'update'), false);
  });
});

test('incident stats are owner/admin only and use the verified identity', async () => {
  await withApp(incidentHandler, async (app) => {
    const denied = await app.inject({
      method: 'GET',
      url: '/api/incidents/stats',
      headers: {
        authorization: `Bearer ${sign(app, USER_A)}`,
        'x-user-id': 'owner-1',
        'x-role': 'owner_admin',
      },
    });
    assert.equal(denied.statusCode, 403);

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/incidents/stats',
      headers: { authorization: `Bearer ${sign(app, OWNER)}` },
    });
    assert.equal(allowed.statusCode, 200);
    assert.deepEqual(allowed.json(), { total: 3, pending: 1, resolved: 2 });
  });
});

test('incident database errors are sanitized', async () => {
  const handler = () => ({ data: null, error: { message: 'postgres://user:leak-me@db.internal' } });
  await withApp(handler, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/incidents',
      headers: { authorization: `Bearer ${sign(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error, 'INCIDENTS_UNAVAILABLE');
    assert.equal(response.body.includes('leak-me'), false);
    assert.equal(response.body.includes('db.internal'), false);
  });
});
