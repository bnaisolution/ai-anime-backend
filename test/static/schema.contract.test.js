'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSchema, columnNames, columnMap } = require('../helpers/schema');

const { tables, byName } = loadSchema();

const REQUIRED_TABLES = [
  'projects', 'api_commands', 'pending_actions', 'quota_usage', 'scenes', 'clips',
  'episodes', 'episode_beats', 'episode_states', 'characters', 'bible_versions',
  'canon_facts', 'canon_change_proposals', 'story_timeline', 'scene_library',
  'voice_catalog', 'user_system_prompts', 'callback_inbox', 'outbox_events',
];

test('live schema snapshot contains 73 public tables', () => {
  assert.equal(tables.length, 73);
});

test('live schema snapshot contains every table required by the contracts', () => {
  const missing = REQUIRED_TABLES.filter((name) => !byName.has(name));
  assert.deepEqual(missing, []);
});

test('all tables declare rls_enabled and rls_policies metadata', () => {
  const bad = tables.filter((table) => typeof table.rls_enabled !== 'boolean' || !Array.isArray(table.rls_policies));
  assert.deepEqual(bad.map((table) => table.table_name), []);
});

test('projects matches the verified live column set', () => {
  const expected = [
    'id', 'user_id', 'name', 'created_at', 'is_active', 'story_bible', 'current_season',
    'current_episode', 'continuity_version', 'season_arc', 'bible_diff_log', 'description',
    'genre', 'language', 'updated_at', 'universe_id', 'canon_version', 'auto_approve',
    'budget_ceiling', 'visual_style', 'style_profile_id', 'visual_medium',
    'active_system_prompt_id',
  ];
  assert.deepEqual(columnNames(byName.get('projects')), expected);
  const cols = columnMap(byName.get('projects'));
  assert.equal(cols.get('id').default, 'gen_random_uuid()');
  assert.equal(cols.get('id').null, 'NO');
  assert.equal(cols.get('user_id').type, 'text');
  const fk = byName.get('projects').fkeys.find((entry) => entry.col === 'active_system_prompt_id');
  assert.ok(fk, 'active_system_prompt_id FK is declared');
  assert.equal(fk.ref_table, 'user_system_prompts');
  assert.equal(fk.ref_col, 'id');
});

test('scenes does not have voice_text or dialogue columns', () => {
  const cols = columnNames(byName.get('scenes'));
  assert.equal(cols.includes('voice_text'), false);
  assert.equal(cols.includes('dialogue'), false);
  assert.equal(cols.includes('dialogue_speaker_id'), true);
});

test('clips is the table that owns voice_text', () => {
  assert.equal(columnNames(byName.get('clips')).includes('voice_text'), true);
});

test('api_commands matches the verified live column set', () => {
  assert.deepEqual(
    columnNames(byName.get('api_commands')),
    ['id', 'project_id', 'user_id', 'intent', 'payload', 'status', 'idempotency_key', 'body_hash', 'created_at']
  );
});

test('pending_actions links to jobs, not commands', () => {
  const cols = columnNames(byName.get('pending_actions'));
  assert.equal(cols.includes('job_id'), true);
  assert.equal(cols.includes('command_id'), false);
});

test('quota_usage has accumulated_units only', () => {
  const cols = columnNames(byName.get('quota_usage'));
  assert.equal(cols.includes('accumulated_units'), true);
  assert.equal(cols.includes('tokens_used'), false);
  assert.equal(cols.includes('units_used'), false);
  assert.equal(cols.includes('request_count'), false);
});

test('episodes has synopsis and updated_at', () => {
  const cols = columnNames(byName.get('episodes'));
  assert.equal(cols.includes('synopsis'), true);
  assert.equal(cols.includes('updated_at'), true);
});
