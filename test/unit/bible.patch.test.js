'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const {
  stableStringify, hashStoryBible, normalizePatchFields,
  persistBiblePatchFromCallback, approveBiblePatch,
} = H.dist('modules/anime/bible/bible.patch.service.js');

const PROJECT = '11111111-1111-4111-8111-111111111111';
const COMMAND = '22222222-2222-4222-8222-222222222222';
const PATCH = '44444444-4444-4444-8444-444444444444';
const USER = '55555555-5555-4555-8555-555555555555';

test('stable hash ignores object key order and detects changes', () => {
  const a = hashStoryBible({ premise: 'x', nested: { b: 2, a: 1 } });
  const b = hashStoryBible({ nested: { a: 1, b: 2 }, premise: 'x' });
  assert.equal(a, b);
  assert.notEqual(a, hashStoryBible({ premise: 'y', nested: { a: 1, b: 2 } }));
  assert.equal(stableStringify([{ b: 2, a: 1 }]), '[{"a":1,"b":2}]');
});

test('patch fields reject protected keys, prototype pollution, and empty payloads', () => {
  assert.throws(() => normalizePatchFields({}), /no changes/);
  assert.throws(() => normalizePatchFields({ auto_approve: true }), /Protected field/);
  assert.throws(() => normalizePatchFields(JSON.parse('{"__proto__":{"x":1}}')), /Invalid Bible patch field/);
  assert.deepEqual(normalizePatchFields({ premise: 'new' }), { premise: 'new' });
});

test('callback PATCH_READY is queued once in pending_actions with approval row', async () => {
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'projects' && call.action === 'select') {
      return { data: { id: PROJECT, user_id: USER, story_bible: { premise: 'old' } }, error: null };
    }
    if (call.table === 'pending_actions' && call.action === 'select') return { data: null, error: null };
    if (call.table === 'pending_actions' && call.action === 'insert') {
      return { data: { ...call.payload, created_at: new Date().toISOString() }, error: null };
    }
    return { data: null, error: null };
  });
  const first = await persistBiblePatchFromCallback({
    project_id: PROJECT, command_id: COMMAND,
    callback: { result: { status: 'PATCH_READY', patch: { fields: { premise: 'new' }, summary: 'tighten premise', base_version: 3 } } },
  });
  assert.equal(first.status, 'PATCH_READY');
  assert.equal(first.base_version, 3);
  assert.equal(state.calls.filter((c) => c.table === 'pending_actions' && c.action === 'insert').length, 1);
  assert.equal(state.calls.filter((c) => c.table === 'approval_decisions' && c.action === 'insert').length, 1);
  const inserted = state.calls.find((c) => c.table === 'pending_actions' && c.action === 'insert').payload;
  assert.equal(inserted.action_type, 'BIBLE_PATCH');
  assert.equal(inserted.idempotency_key, COMMAND);
  assert.deepEqual(inserted.action_payload.fields, { premise: 'new' });
});

test('approve merges approved fields, snapshots bible_versions, and refuses stale hashes', async () => {
  const current = { premise: 'old', tone: 'calm' };
  const baseHash = hashStoryBible(current);
  let updateAttempt = null;
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'pending_actions' && call.action === 'select') {
      return { data: { id: PATCH, project_id: PROJECT, status: 'PATCH_READY', created_at: new Date().toISOString(), expires_at: null,
        action_payload: { base_hash: baseHash, base_version: 1, fields: { premise: 'new' }, summary: 'tighten' } }, error: null };
    }
    if (call.table === 'projects' && call.action === 'select') return { data: { id: PROJECT, story_bible: current, current_season: 1 }, error: null };
    if (call.table === 'projects' && call.action === 'update') {
      updateAttempt = call;
      return { data: { id: PROJECT, story_bible: call.payload.story_bible }, error: null };
    }
    return { data: null, error: null };
  });
  const applied = await approveBiblePatch({ project_id: PROJECT, patch_id: PATCH, user_id: USER, expected_base_hash: baseHash });
  assert.equal(applied.status, 'APPLIED');
  assert.deepEqual(updateAttempt.payload.story_bible, { premise: 'new', tone: 'calm' });
  assert.ok(updateAttempt.filters.some((f) => f.op === 'eq' && f.col === 'story_bible'));
  assert.equal(state.calls.filter((c) => c.table === 'bible_versions' && c.action === 'insert').length, 1);
  assert.equal(state.calls.filter((c) => c.table === 'pending_actions' && c.action === 'update').length, 1);

  await assert.rejects(
    () => approveBiblePatch({ project_id: PROJECT, patch_id: PATCH, user_id: USER, expected_base_hash: 'stale' }),
    (error) => error.httpStatus === 409
  );
});
