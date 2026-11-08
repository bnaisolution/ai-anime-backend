'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const { requireProjectRole } = H.dist('modules/anime/auth/project-guard.js');

const OWNER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';

function request({ userId, role = 'owner' } = {}) {
  return {
    authContext: userId ? { userId, role } : undefined,
    params: { id: PROJECT },
    body: {},
    query: {},
    server: {},
  };
}

test('REGRESSION: guard must not auto-claim a project whose user_id is null', async () => {
  const fake = installFakeSupabase(async (call) => {
    if (call.action === 'select') return { data: { id: PROJECT, user_id: null }, error: null };
    return { data: null, error: null };
  });
  await assert.rejects(
    () => requireProjectRole(['owner'])(request({ userId: OWNER }), {}),
    (error) => error.code === 'PROJECT_FORBIDDEN'
  );
  const mutations = fake.state.calls.filter((call) => call.action === 'update');
  assert.deepEqual(mutations, [], 'guard must not write ownership during authorization');
});

test('REGRESSION: guard must honor the authenticated role and allowedRoles', async () => {
  installFakeSupabase(async () => ({ data: { id: PROJECT, user_id: OWNER }, error: null }));
  await assert.rejects(
    () => requireProjectRole(['owner'])(request({ userId: OWNER, role: 'viewer' }), {}),
    (error) => error.code === 'PROJECT_FORBIDDEN'
  );
});
