'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const {
  stableStringify, hashStoryBible, normalizePatchFields,
  persistBiblePatchFromCallback, approveBiblePatch,
} = H.dist('modules/anime/bible/bible.patch.service.js');
const { normalizeBibleEntities } = H.dist('modules/anime/bible/bible.entities.service.js');

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

test('Bible entities normalize codes and keep only writable fields', () => {
  const entities = normalizeBibleEntities({
    characters: [{ character_code: 'char_001', name: 'Aarav', gender: 'male' }],
    arcs: [{ character_code: 'char_001', arc_name: 'Rise', stages: ['a'] }],
    powers: [{ power_name: 'Shadow Step', abilities: ['blink'] }],
    relationships: [{ char_a_code: 'char_001', char_b_code: 'char_002', trust_level: 70 }],
    locations: [{ location_code: 'loc_001', name: 'Neo Delhi' }],
    artifacts: [{ artifact_code: 'art_001', name: 'Blade', owner: 'char_001' }],
    rules: [{ rule_code: 'rule_001', rule_text: 'No guns', priority: 1 }],
  });
  assert.equal(entities.characters[0].character_code, 'CHAR_001');
  assert.equal('gender' in entities.characters[0], false);
  assert.equal(entities.powers[0].character_code, 'GLOBAL');
  assert.equal(entities.relationships[0].trust_level, 70);
  assert.equal(entities.locations[0].location_code, 'LOC_001');
  assert.equal(entities.artifacts[0].current_owner_code, 'CHAR_001');
  assert.equal(entities.rules[0].priority, '1');
});

test('callback PATCH_READY persists entity-only patches', async () => {
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
  const patch = await persistBiblePatchFromCallback({
    project_id: PROJECT, command_id: COMMAND,
    callback: { result: { status: 'PATCH_READY', patch: {
      fields: {}, summary: 'new cast',
      entities: { characters: [{ character_code: 'CHAR_001', name: 'Aarav' }] },
    } } },
  });
  assert.equal(patch.status, 'PATCH_READY');
  const inserted = state.calls.find((c) => c.table === 'pending_actions' && c.action === 'insert').payload;
  assert.deepEqual(inserted.action_payload.fields, {});
  assert.equal(inserted.action_payload.entities.characters.length, 1);
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
    if (call.table === 'pending_actions' && call.action === 'update') {
      return { data: { id: PATCH }, error: null };
    }
    if (call.table === 'projects' && call.action === 'update') {
      updateAttempt = call;
      return { data: { id: PROJECT, story_bible: call.payload.story_bible }, error: null };
    }
    return { data: null, error: null };
  });
  const applied = await approveBiblePatch({ project_id: PROJECT, patch_id: PATCH, user_id: USER, expected_base_hash: baseHash });
  assert.equal(applied.status, 'APPLIED');
  assert.equal(updateAttempt.payload.story_bible.premise, 'new');
  assert.equal(updateAttempt.payload.story_bible.tone, 'calm');
  assert.ok(updateAttempt.payload.story_bible.bible_approved_at);
  assert.equal(updateAttempt.payload.story_bible.bible_approved_by, USER);
  assert.ok(updateAttempt.filters.some((f) => f.op === 'eq' && f.col === 'story_bible'));
  assert.equal(state.calls.filter((c) => c.table === 'bible_versions' && c.action === 'insert').length, 1);
  assert.equal(state.calls.filter((c) => c.table === 'pending_actions' && c.action === 'update').length, 2);

  await assert.rejects(
    () => approveBiblePatch({ project_id: PROJECT, patch_id: PATCH, user_id: USER, expected_base_hash: 'stale' }),
    (error) => error.httpStatus === 409
  );
});


test('approve rejects unknown Bible entity references before writing', async () => {
  const current = { premise: 'old' };
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'pending_actions' && call.action === 'select') {
      return { data: { id: PATCH, project_id: PROJECT, status: 'PATCH_READY', created_at: new Date().toISOString(), expires_at: null,
        action_payload: {
          base_hash: hashStoryBible(current), base_version: 1, fields: {},
          entities: { relationships: [{ char_a_code: 'CHAR_001', char_b_code: 'CHAR_999' }] },
          summary: 'bad refs',
        } }, error: null };
    }
    if (call.table === 'projects' && call.action === 'select') return { data: { id: PROJECT, story_bible: current, current_season: 1 }, error: null };
    if (call.table === 'characters' && call.action === 'select') return { data: [], error: null };
    return { data: null, error: null };
  });
  await assert.rejects(
    () => approveBiblePatch({ project_id: PROJECT, patch_id: PATCH, user_id: USER }),
    (error) => error.code === 'OUTPUT_INVALID' && /unknown characters/i.test(error.message)
  );
  assert.equal(state.calls.filter((call) => call.table === 'projects' && call.action === 'update').length, 0);
  assert.equal(state.calls.filter((call) => call.table === 'pending_actions' && call.action === 'update').length, 0);
});

test('re-applying an applied Bible patch is idempotent', async () => {
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'pending_actions' && call.action === 'select') {
      return { data: { id: PATCH, project_id: PROJECT, status: 'APPLIED', created_at: new Date().toISOString(), expires_at: null,
        action_payload: { fields: { premise: 'new' }, summary: 'done' } }, error: null };
    }
    return { data: null, error: null };
  });
  const result = await approveBiblePatch({ project_id: PROJECT, patch_id: PATCH, user_id: USER });
  assert.equal(result.status, 'APPLIED');
  assert.equal(state.calls.filter((call) => call.table === 'projects' && call.action === 'update').length, 0);
  assert.equal(state.calls.filter((call) => call.table === 'pending_actions' && call.action === 'update').length, 0);
});
