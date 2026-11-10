'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const { recoverStaleProcessing } = H.dist('modules/anime/outbox/outbox.repo.js');

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
