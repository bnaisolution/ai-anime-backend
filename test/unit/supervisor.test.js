'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const { reconcileCommand } = H.dist('modules/anime/supervisor/supervisor.service.js');

const PROJECT = '11111111-1111-4111-8111-111111111111';
const COMMAND = '22222222-2222-4222-8222-222222222222';

function command(overrides = {}) {
  return {
    id: COMMAND,
    project_id: PROJECT,
    user_id: 'user-1',
    status: 'DISPATCHED',
    payload: { episode_no: 1 },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function install(commandRow, pendingActions = []) {
  return installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') {
      return { data: commandRow, error: null };
    }
    if (call.table === 'episode_states' && call.action === 'select') {
      return { data: null, error: null };
    }
    if (call.table === 'pending_actions' && call.action === 'select') {
      return { data: pendingActions, error: null };
    }
    return { data: null, error: null };
  });
}

test('reconcileCommand maps completed callbacks to SUCCEEDED', async () => {
  const { state } = install(command());
  const result = await reconcileCommand({
    project_id: PROJECT,
    command_id: COMMAND,
    callback_payload: { status: 'COMPLETED' },
  });
  assert.equal(result.next_status, 'SUCCEEDED');
  const update = state.calls.find((call) => call.table === 'api_commands' && call.action === 'update');
  assert.equal(update.payload.status, 'SUCCEEDED');
  assert.deepEqual(
    update.filters.filter((filter) => filter.op === 'eq').map((filter) => [filter.col, filter.value]),
    [['project_id', PROJECT], ['id', COMMAND]]
  );
});

test('reconcileCommand maps failed callbacks to FAILED', async () => {
  const { state } = install(command());
  const result = await reconcileCommand({
    project_id: PROJECT,
    command_id: COMMAND,
    callback_payload: { status: 'FAILED' },
  });
  assert.equal(result.next_status, 'FAILED');
  assert.equal(state.calls.find((call) => call.table === 'api_commands' && call.action === 'update').payload.status, 'FAILED');
});

test('reconcileCommand keeps terminal commands immutable on late callbacks', async () => {
  const { state } = install(command({ status: 'SUCCEEDED' }));
  const result = await reconcileCommand({
    project_id: PROJECT,
    command_id: COMMAND,
    callback_payload: { status: 'FAILED' },
  });
  assert.equal(result.next_status, 'SUCCEEDED');
  assert.equal(state.calls.filter((call) => call.table === 'api_commands' && call.action === 'update').length, 0);
});

test('reconcileCommand escalates stale RECONCILING commands to MANUAL_REVIEW', async () => {
  const stale = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  const { state } = install(command({ status: 'RECONCILING', created_at: stale }));
  const result = await reconcileCommand({ project_id: PROJECT, command_id: COMMAND });
  assert.equal(result.next_status, 'MANUAL_REVIEW');
  assert.equal(state.calls.find((call) => call.table === 'api_commands' && call.action === 'update').payload.status, 'MANUAL_REVIEW');
});

test('reconcileCommand does not flap a recent RECONCILING command', async () => {
  const { state } = install(command({ status: 'RECONCILING' }));
  const result = await reconcileCommand({ project_id: PROJECT, command_id: COMMAND });
  assert.equal(result.next_status, 'RECONCILING');
  assert.equal(state.calls.filter((call) => call.table === 'api_commands' && call.action === 'update').length, 0);
});

test('reconcileCommand maps pending job actions to MANUAL_REVIEW', async () => {
  const { state } = install(command(), [{ id: 'pa-1', job_id: COMMAND, status: 'PENDING' }]);
  const result = await reconcileCommand({ project_id: PROJECT, command_id: COMMAND });
  assert.equal(result.next_status, 'MANUAL_REVIEW');
  assert.equal(state.calls.find((call) => call.table === 'api_commands' && call.action === 'update').payload.status, 'MANUAL_REVIEW');
});
