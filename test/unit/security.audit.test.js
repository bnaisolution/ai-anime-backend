'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const { evaluateAuthorization } = H.dist('security/permissionEngine.js');

const auth = {
  userId: 'user-1',
  workspaceId: 'ws-1',
  email: 'user@test.invalid',
  role: 'normal_user',
  isServiceIdentity: false,
};

function input(projectId, caller = auth) {
  return {
    auth: caller,
    action: 'EXECUTE_CHAT',
    resourceType: 'workflow',
    resourceId: 'WF-00',
    projectId,
    risk: 'read_only',
  };
}

test('authorization denies a project that does not exist instead of failing open', async () => {
  const fake = installFakeSupabase(() => ({ data: null, error: null }));
  const fastify = { supabase: fake.client };

  const result = await evaluateAuthorization(fastify, input('project-missing'));

  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 403);
  assert.equal(result.errorCategory, 'FORBIDDEN');
  assert.equal(fake.state.calls[0].table, 'projects');
  assert.equal(fake.state.calls[0].filters.some((filter) => filter.col === 'id' && filter.value === 'project-missing'), true);
});

test('authorization denies a project lookup error instead of failing open', async () => {
  const fake = installFakeSupabase(() => ({ data: null, error: { message: 'lookup failed' } }));
  const fastify = { supabase: fake.client };

  const result = await evaluateAuthorization(fastify, input('project-lookup-error'));

  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 403);
});

test('authorization denies a normal user access to another user project', async () => {
  const fake = installFakeSupabase(() => ({ data: { id: 'project-1', user_id: 'user-2' }, error: null }));
  const fastify = { supabase: fake.client };

  const result = await evaluateAuthorization(fastify, input('project-1'));

  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 403);
});

test('authorization denies a normal user access to a null-owner project', async () => {
  const fake = installFakeSupabase(() => ({ data: { id: 'project-1', user_id: null }, error: null }));
  const fastify = { supabase: fake.client };

  const result = await evaluateAuthorization(fastify, input('project-1'));

  assert.equal(result.allowed, false);
  assert.equal(result.httpStatus, 403);
});

test('authorization allows a normal user to use their own project', async () => {
  const fake = installFakeSupabase(() => ({ data: { id: 'project-1', user_id: 'user-1' }, error: null }));
  const fastify = { supabase: fake.client };

  const result = await evaluateAuthorization(fastify, input('project-1'));

  assert.equal(result.allowed, true);
  assert.equal(result.httpStatus, 200);
});

test('authorization allows the owner admin to use an existing project', async () => {
  const fake = installFakeSupabase(() => ({ data: { id: 'project-1', user_id: 'user-2' }, error: null }));
  const fastify = { supabase: fake.client };
  const owner = { ...auth, userId: 'owner-1', email: 'owner@test.invalid', role: 'owner_admin' };

  const result = await evaluateAuthorization(fastify, input('project-1', owner));

  assert.equal(result.allowed, true);
  assert.equal(result.httpStatus, 200);
});
