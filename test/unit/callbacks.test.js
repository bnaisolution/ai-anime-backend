'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const { signCallbackPayload } = H.dist('modules/anime/callbacks/signature.js');
const { handleCallbackRequest } = H.dist('modules/anime/callbacks/callbacks.handler.js');

const PROJECT = '11111111-1111-4111-8111-111111111111';
const COMMAND = '22222222-2222-4222-8222-222222222222';
const OTHER_PROJECT = '33333333-3333-4333-8333-333333333333';
const SECRET = process.env.ANIME_N8N_CALLBACK_SECRET;

function signedRequest(payload, nonce) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    source: 'n8n',
    rawBody,
    signatureHeader: signCallbackPayload(timestamp, rawBody, SECRET),
    timestampHeader: timestamp,
    nonceHeader: nonce,
    requestId: `req-${nonce}`,
  };
}

test('callback rejects a command that belongs to another project before persisting anything', async () => {
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });

  await assert.rejects(
    () => handleCallbackRequest(signedRequest({ project_id: OTHER_PROJECT, command_id: COMMAND, status: 'COMPLETED' }, `nonce-mismatch-${Date.now()}`)),
    (error) => error.code === 'CALLBACK_REPLAY' && error.httpStatus === 409
  );
  assert.deepEqual(state.calls.filter((call) => call.action === 'insert'), []);
});

test('callback binds the verified command to its project and enqueues reconcile exactly once', async () => {
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') {
      return { data: { id: COMMAND, project_id: PROJECT }, error: null };
    }
    if (call.table === 'callback_inbox' && call.action === 'insert') {
      return { data: { id: 'callback-row' }, error: null };
    }
    return { data: null, error: null };
  });

  const result = await handleCallbackRequest(signedRequest({
    project_id: PROJECT,
    command_id: COMMAND,
    callback_id: `callback-${Date.now()}`,
    status: 'COMPLETED',
  }, `nonce-bound-${Date.now()}`));

  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, false);
  const commandSelect = state.calls.find((call) => call.table === 'api_commands' && call.action === 'select');
  assert.deepEqual(
    commandSelect.filters.filter((filter) => filter.op === 'eq').map((filter) => [filter.col, filter.value]),
    [['id', COMMAND], ['project_id', PROJECT]]
  );
  const outboxInserts = state.calls.filter((call) => call.table === 'outbox_events' && call.action === 'insert');
  assert.equal(outboxInserts.length, 1);
  assert.equal(outboxInserts[0].payload.type, 'reconcile_command');
  assert.equal(outboxInserts[0].payload.payload.command_id, COMMAND);
  assert.equal(outboxInserts[0].payload.payload.project_id, PROJECT);
});
