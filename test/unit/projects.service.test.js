'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

test('createProjectSynchronous generates the project id server-side and stores the owner', async () => {
  let insertPayload;
  const { state } = installFakeSupabase(async (call) => {
    if (call.action === 'insert' && call.table === 'projects') {
      insertPayload = call.payload;
      return { data: { ...call.payload, created_at: '2026-11-07T00:00:00.000Z' }, error: null };
    }
    return { data: null, error: null };
  });

  const { createProjectSynchronous } = H.dist('modules/anime/reads/projects.service.js');
  const created = await createProjectSynchronous({
    userId: '11111111-1111-4111-8111-111111111111',
    name: '  Stage 3 Project  ',
  });

  assert.ok(insertPayload, 'insert was called');
  assert.equal(state.calls.filter((c) => c.action === 'insert').length, 1);
  assert.match(created.id, UUID_V4);
  assert.notEqual(created.id, ZERO_UUID);
  assert.equal(insertPayload.id, created.id, 'database insert uses the generated id');
  assert.equal(insertPayload.user_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(insertPayload.name, 'Stage 3 Project');
  assert.equal(insertPayload.is_active, true);
  assert.equal(insertPayload.current_season, 1);
  assert.equal(insertPayload.current_episode, 1);
  assert.equal(insertPayload.story_bible.title, 'Stage 3 Project');
});

test('createProjectSynchronous surfaces database failures as INTERNAL errors', async () => {
  installFakeSupabase(async (call) => {
    if (call.action === 'insert' && call.table === 'projects') {
      return { data: null, error: { message: 'insert failed' } };
    }
    return { data: null, error: null };
  });

  const { createProjectSynchronous } = H.dist('modules/anime/reads/projects.service.js');
  await assert.rejects(
    () => createProjectSynchronous({ userId: '11111111-1111-4111-8111-111111111111', name: 'X' }),
    (error) => error.code === 'INTERNAL' && error.httpStatus === 500
  );
});

test('createProjectSynchronous does not accept a client-supplied id', async () => {
  let insertPayload;
  installFakeSupabase(async (call) => {
    if (call.action === 'insert' && call.table === 'projects') {
      insertPayload = call.payload;
      return { data: { ...call.payload }, error: null };
    }
    return { data: null, error: null };
  });

  const { createProjectSynchronous } = H.dist('modules/anime/reads/projects.service.js');
  const forgedId = '22222222-2222-4222-8222-222222222222';
  const created = await createProjectSynchronous({
    userId: '11111111-1111-4111-8111-111111111111',
    name: 'Forged',
    id: forgedId,
  });
  assert.notEqual(created.id, forgedId);
  assert.notEqual(insertPayload.id, forgedId);
});
