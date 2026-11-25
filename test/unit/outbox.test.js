'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const { recoverStaleProcessing, markDispatched, markFailed, markDeadLetter } = H.dist('modules/anime/outbox/outbox.repo.js');
const { buildPersistedCommandPayload, processAutoQcEnqueueEvent } = H.dist('modules/anime/outbox/outbox.dispatcher.js');

test('recoverStaleProcessing requeues stale processing leases', async () => {
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'outbox_events' && call.action === 'update') {
      return { data: [{ id: 'event-1' }], error: null };
    }
    return { data: null, error: null };
  });

  const recovered = await recoverStaleProcessing(10);
  assert.equal(recovered, 1);
  const update = state.calls.find((call) => call.table === 'outbox_events' && call.action === 'update');
  assert.equal(update.payload.status, 'pending');
  assert.equal(update.payload.processing_started_at, null);
  assert.ok(update.filters.some((filter) => filter.op === 'eq' && filter.col === 'status' && filter.value === 'processing'));
  assert.ok(update.filters.some((filter) => filter.op === 'or' && filter.value.includes('processing_started_at.lt.')));
  assert.ok(update.filters.some((filter) => filter.op === 'or' && filter.value.includes('processing_started_at.is.null')));
});

test('recoverStaleProcessing falls back to created_at when the lease column is absent', async () => {
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'outbox_events' && call.action === 'update') {
      const usesLease = call.filters.some((filter) => filter.op === 'or' && filter.value.includes('processing_started_at'));
      if (usesLease) return { data: null, error: { code: '42703', message: 'column processing_started_at does not exist' } };
      return { data: [{ id: 'event-1' }], error: null };
    }
    return { data: null, error: null };
  });

  const recovered = await recoverStaleProcessing(10);
  assert.equal(recovered, 1);
  const updates = state.calls.filter((call) => call.table === 'outbox_events' && call.action === 'update');
  assert.equal(updates.length, 2);
  assert.ok(updates[1].filters.some((filter) => filter.op === 'lt' && filter.col === 'created_at'));
});

test('outbox state transitions fail closed when the update is rejected', async () => {
  installFakeSupabase(async (call) => {
    if (call.table === 'outbox_events' && call.action === 'update') {
      return { data: null, error: { code: '42703', message: 'column processing_started_at does not exist' } };
    }
    return { data: null, error: null };
  });
  await assert.rejects(() => markDispatched('event-1'), /mark-dispatched failed/);
  await assert.rejects(() => markFailed('event-1', 1, new Date().toISOString(), 'boom'), /mark-failed failed/);
  await assert.rejects(() => markDeadLetter('event-1', 5, 'boom'), /dead-letter update failed/);
});


test('buildPersistedCommandPayload preserves flat auto-QC metadata and nested payload', () => {
  const persisted = buildPersistedCommandPayload({
    command_id: 'cmd-1',
    project_id: 'project-1',
    season_no: 3,
    episode_no: 2,
    media_url: 'https://cdn/master.mp4',
    payload: { nested_key: 'nested-value' },
  }, { execution_id: 'exec-1', raw: { ok: true } });

  assert.equal(persisted.command_id, 'cmd-1');
  assert.equal(persisted.season_no, 3);
  assert.equal(persisted.episode_no, 2);
  assert.equal(persisted.media_url, 'https://cdn/master.mp4');
  assert.equal(persisted.nested_key, 'nested-value');
  assert.equal(persisted.payload, undefined);
  assert.equal(persisted.execution_id, 'exec-1');
  assert.deepEqual(persisted.n8n_response, { ok: true });
});

test('processAutoQcEnqueueEvent creates the queued command and marks the outbox event dispatched', async () => {
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'outbox_events' && call.action === 'update') return { data: null, error: null };
    return { data: null, error: null };
  }, () => ({ data: { id: 'cmd-1' }, error: null }));

  await processAutoQcEnqueueEvent({
    id: 'event-1',
    attempts: 1,
    payload: {
      command_id: 'cmd-1',
      project_id: 'project-1',
      user_id: 'user-1',
      intent: 'RUN_QC',
      idempotency_key: 'auto_qc:project-1:s3:e2:abc',
      body_hash: 'hash',
      command_payload: { media_url: 'https://cdn/master.mp4' },
      outbox_payload: { wf_key: 'WF-11' },
      parent_command_id: 'parent-1',
      season_no: 3,
      episode_no: 2,
    },
  });

  const rpc = state.rpcCalls.find((call) => call.name === 'insert_anime_command_atomic');
  assert.ok(rpc);
  assert.equal(rpc.args.p_intent, 'RUN_QC');
  assert.equal(rpc.args.p_payload.media_url, 'https://cdn/master.mp4');
  const update = state.calls.find((call) => call.table === 'outbox_events' && call.action === 'update');
  assert.equal(update.payload.status, 'dispatched');
});

test('processAutoQcEnqueueEvent marks the retry pending when the atomic insert fails', async () => {
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'outbox_events' && call.action === 'update') return { data: null, error: null };
    return { data: null, error: null };
  }, () => ({ data: null, error: { code: 'XX000', message: 'atomic insert unavailable' } }));

  await processAutoQcEnqueueEvent({
    id: 'event-1',
    attempts: 1,
    payload: {
      command_id: 'cmd-1',
      project_id: 'project-1',
      user_id: 'user-1',
      intent: 'RUN_QC',
      idempotency_key: 'auto_qc:project-1:s3:e2:abc',
      body_hash: 'hash',
      command_payload: { media_url: 'https://cdn/master.mp4' },
      outbox_payload: { wf_key: 'WF-11' },
      season_no: 3,
      episode_no: 2,
    },
  });

  const update = state.calls.find((call) => call.table === 'outbox_events' && call.action === 'update');
  assert.equal(update.payload.status, 'pending');
  assert.equal(update.payload.attempts, 1);
  assert.match(update.payload.last_error, /atomic command insert failed/i);
});
