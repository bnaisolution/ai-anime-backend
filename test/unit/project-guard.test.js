'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const { requireProjectRole } = H.dist('modules/anime/auth/project-guard.js');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';

function request({ userId, role = 'owner', params = { id: PROJECT }, body = {}, query = {} } = {}) {
  return {
    authContext: userId ? { userId, role } : undefined,
    params,
    body,
    query,
    server: {},
  };
}

test('requireProjectRole rejects a request with no authenticated identity', async () => {
  installFakeSupabase(async () => ({ data: null, error: null }));
  await assert.rejects(
    () => requireProjectRole(['owner'])(request(), {}),
    (error) => error.code === 'AUTH_INVALID'
  );
});

test('requireProjectRole rejects the all-zero project uuid', async () => {
  installFakeSupabase(async () => ({ data: null, error: null }));
  await assert.rejects(
    () => requireProjectRole(['owner'])(request({ userId: OWNER, params: { id: '00000000-0000-0000-0000-000000000000' } }), {}),
    (error) => error.code === 'PROJECT_FORBIDDEN'
  );
});

test('requireProjectRole rejects a project owned by another user', async () => {
  installFakeSupabase(async () => ({ data: { id: PROJECT, user_id: OTHER }, error: null }));
  await assert.rejects(
    () => requireProjectRole(['owner'])(request({ userId: OWNER }), {}),
    (error) => error.code === 'PROJECT_FORBIDDEN'
  );
});

test('requireProjectRole allows the owner of an existing project', async () => {
  installFakeSupabase(async () => ({ data: { id: PROJECT, user_id: OWNER }, error: null }));
  const req = request({ userId: OWNER });
  await requireProjectRole(['owner'])(req, {});
  assert.equal(req.anime.user_id, OWNER);
  assert.equal(req.anime.project_id, PROJECT);
  assert.equal(req.anime.role, 'owner');
});

test('requireProjectRole rejects a null-owner project without claiming it', async () => {
  const fake = installFakeSupabase(async () => ({ data: { id: PROJECT, user_id: null }, error: null }));
  await assert.rejects(
    () => requireProjectRole(['owner'])(request({ userId: OWNER }), {}),
    (error) => error.code === 'PROJECT_FORBIDDEN'
  );
  const updates = fake.state.calls.filter((call) => call.action === 'update');
  assert.deepEqual(updates, []);
});

test('requireProjectRole enforces allowedRoles instead of hardcoding owner', async () => {
  installFakeSupabase(async () => ({ data: { id: PROJECT, user_id: OWNER }, error: null }));
  await assert.rejects(
    () => requireProjectRole(['admin'])(request({ userId: OWNER, role: 'owner' }), {}),
    (error) => error.code === 'PROJECT_FORBIDDEN'
  );
});

test('requireProjectRole rejects a spoofed x-user-id header', async () => {
  installFakeSupabase(async () => ({ data: { id: PROJECT, user_id: OWNER }, error: null }));
  const req = request({ userId: OWNER });
  req.headers = { 'x-user-id': OTHER };
  await assert.rejects(
    () => requireProjectRole(['owner'])(req, {}),
    (error) => error.code === 'PROJECT_FORBIDDEN'
  );
});

test('requireProjectRole rejects conflicting project ids in path and query', async () => {
  installFakeSupabase(async () => ({ data: { id: PROJECT, user_id: OWNER }, error: null }));
  await assert.rejects(
    () => requireProjectRole(['owner'])(request({ userId: OWNER, query: { project_id: OTHER } }), {}),
    (error) => error.code === 'PROJECT_FORBIDDEN'
  );
});

test('requireProjectRole rejects a query user_id identity override', async () => {
  installFakeSupabase(async () => ({ data: { id: PROJECT, user_id: OWNER }, error: null }));
  await assert.rejects(
    () => requireProjectRole(['owner'])(request({ userId: OWNER, query: { user_id: OTHER } }), {}),
    (error) => error.code === 'PROJECT_FORBIDDEN'
  );
});
