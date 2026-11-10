'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const { submitAnimeCommand, computeCommandBodyHash } = H.dist('modules/anime/commands/commands.service.js');

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';

function install(existing) {
  return installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') return { data: null, error: null };
    if (call.table === 'projects' && call.action === 'select') {
      return { data: { id: PROJECT, visual_medium: 'ANIME', active_system_prompt_id: null }, error: null };
    }
    if (call.table === 'user_system_prompts' && call.action === 'select') return { data: [], error: null };
    if (call.table === 'user_infrastructure' && call.action === 'select') return { data: [], error: null };
    return { data: null, error: null };
  }, () => ({ data: existing, error: null }));
}

const BODY = {
  intent: 'CREATE_PROJECT',
  project_id: PROJECT,
  payload: { name: 'Race' },
};

test('atomic insert replay with a different body is rejected as an idempotency conflict', async () => {
  const key = `race-conflict-${Date.now()}`;
  const { state } = install({
    id: 'existing-command',
    project_id: PROJECT,
    user_id: USER,
    intent: 'CREATE_PROJECT',
    status: 'QUEUED',
    idempotency_key: key,
    body_hash: 'different-hash',
    payload: {},
  });

  await assert.rejects(
    () => submitAnimeCommand({
      idempotencyKey: key,
      userId: USER,
      requestId: 'req-race-conflict',
      body: BODY,
    }),
    (error) => error.code === 'IDEMPOTENCY_CONFLICT'
  );
  assert.deepEqual(state.calls.filter((call) => call.action === 'insert'), []);
});

test('atomic insert replay with the same body is returned as an idempotent replay', async () => {
  const key = `race-replay-${Date.now()}`;
  const { state } = install({
    id: 'existing-command',
    project_id: PROJECT,
    user_id: USER,
    intent: 'CREATE_PROJECT',
    status: 'QUEUED',
    idempotency_key: key,
    body_hash: computeCommandBodyHash(BODY),
    payload: {},
  });

  const result = await submitAnimeCommand({
    idempotencyKey: key,
    userId: USER,
    requestId: 'req-race-replay',
    body: BODY,
  });

  assert.equal(result.command.id, 'existing-command');
  assert.equal(result.idempotent_replay, true);
  assert.deepEqual(state.calls.filter((call) => call.action === 'insert'), []);
});
