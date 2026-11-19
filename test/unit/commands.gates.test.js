'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
process.env.PROJECT_SETUP_GATE = 'true';

const { installFakeSupabase } = require('../helpers/fake-supabase');
const { submitAnimeCommand } = H.dist('modules/anime/commands/commands.service.js');

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
let keySeq = 0;
function key() { keySeq += 1; return `gate-${Date.now()}-${keySeq}`; }

const READY_BIBLE = {
  premise: 'A ready story',
  total_seasons: 1,
  episodes_per_season: 1,
  episode_duration_min: 24,
};

function project(overrides = {}) {
  return {
    id: PROJECT,
    user_id: USER,
    name: 'Gate Project',
    genre: 'Action',
    visual_medium: 'ANIME',
    story_bible: { ...READY_BIBLE, bible_approved_at: '2026-01-01T00:00:00.000Z' },
    current_season: 1,
    ...overrides,
  };
}

function install(options = {}) {
  const config = {
    project: options.project ?? project(),
    castCount: options.castCount ?? 1,
    bibleVersionCount: options.bibleVersionCount ?? 1,
    episode: options.episode ?? null,
    publishRows: options.publishRows ?? [],
  };
  const fake = installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') return { data: null, error: null };
    if (call.table === 'projects' && call.action === 'select') {
      const columns = String(call.columns || '*').split(',').map((column) => column.trim());
      const selected = Object.fromEntries(columns.map((column) => [column, config.project?.[column]]));
      return { data: selected, error: null };
    }
    if (call.table === 'characters' && call.action === 'select') return { data: [], error: null, count: config.castCount };
    if (call.table === 'bible_versions' && call.action === 'select') return { data: [], error: null, count: config.bibleVersionCount };
    if (call.table === 'episodes' && call.action === 'select') return { data: config.episode, error: null };
    if (call.table === 'approval_decisions' && call.action === 'select') {
      const type = call.filters.find((filter) => filter.col === 'type')?.value;
      if (type === 'EPISODE_APPROVAL') return { data: null, error: null };
      if (type === 'PUBLISH') return { data: config.publishRows, error: null };
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
  return fake;
}

function body(intent, extra = {}) {
  return {
    intent,
    project_id: PROJECT,
    mode: 'SAVE',
    episode_no: 1,
    season_no: 1,
    payload: {},
    ...extra,
  };
}

test('production setup gate reads visual_medium before blocking a ready project', async () => {
  const { state } = install({
    bibleVersionCount: 0,
    project: project({ story_bible: { ...READY_BIBLE } }),
  });
  await assert.rejects(
    () => submitAnimeCommand({ idempotencyKey: key(), userId: USER, requestId: 'req-gate-1', body: body('GENERATE_EPISODE') }),
    (error) => error.code === 'STAGE_DEPENDENCY_BLOCKED' && /bible_approval/.test(String(error.message))
  );
  const projectRead = state.calls.find((call) => call.table === 'projects' && call.action === 'select');
  assert.match(projectRead.columns, /visual_medium/);
  assert.equal(state.calls.filter((call) => call.table === 'api_commands' && call.action === 'insert').length, 0);
});

test('production setup gate blocks a project without an approved Bible', async () => {
  const { state } = install({
    bibleVersionCount: 0,
    project: project({ story_bible: { ...READY_BIBLE } }),
  });
  await assert.rejects(
    () => submitAnimeCommand({ idempotencyKey: key(), userId: USER, requestId: 'req-gate-2', body: body('GENERATE_EPISODE') }),
    (error) => {
      assert.equal(error.code, 'STAGE_DEPENDENCY_BLOCKED');
      assert.deepEqual(error.missing, ['bible_approval']);
      assert.equal(error.deep_link, 'bible');
      return true;
    }
  );
  assert.equal(state.calls.filter((call) => call.table === 'api_commands' && call.action === 'insert').length, 0);
});

test('publish gate creates episode approval and refuses QC/approval bypass', async () => {
  const { state } = install({
    episode: { episode_no: 1, season_no: 1, qc_status: 'FAIL', approval_status: 'PENDING', current_state: 'READY' },
  });
  await assert.rejects(
    () => submitAnimeCommand({ idempotencyKey: key(), userId: USER, requestId: 'req-gate-3', body: body('PUBLISH_NOW') }),
    (error) => {
      assert.equal(error.code, 'APPROVAL_REQUIRED');
      assert.deepEqual(error.missing, ['qc_pass', 'episode_approval']);
      assert.equal(error.deep_link, 'review_inbox');
      return true;
    }
  );
  const insertedEpisodeApproval = state.calls.find(
    (call) => call.table === 'approval_decisions' && call.action === 'insert' && call.payload?.type === 'EPISODE_APPROVAL'
  );
  assert.ok(insertedEpisodeApproval, 'a pending episode approval must be created');
  assert.equal(state.calls.filter((call) => call.table === 'api_commands' && call.action === 'insert').length, 0);
});

test('publish gate refuses to publish without explicit publish approval', async () => {
  const { state } = install({
    episode: { episode_no: 1, season_no: 1, qc_status: 'PASS', approval_status: 'APPROVED', current_state: 'READY' },
  });
  await assert.rejects(
    () => submitAnimeCommand({ idempotencyKey: key(), userId: USER, requestId: 'req-gate-4', body: body('PUBLISH_NOW') }),
    (error) => {
      assert.equal(error.code, 'APPROVAL_REQUIRED');
      assert.deepEqual(error.missing, ['publish_approval']);
      assert.equal(error.deep_link, 'review_inbox');
      return true;
    }
  );
  const insertedPublishApproval = state.calls.find(
    (call) => call.table === 'approval_decisions' && call.action === 'insert' && call.payload?.type === 'PUBLISH'
  );
  assert.ok(insertedPublishApproval, 'a pending publish approval must be created');
  assert.equal(state.calls.filter((call) => call.table === 'api_commands' && call.action === 'insert').length, 0);
});

test('every production intent is blocked before Bible approval', async () => {
  const intents = ['GENERATE_EPISODE', 'CONTINUE_EPISODE', 'REGENERATE_EPISODE', 'RUN_QC', 'PUBLISH_NOW'];
  for (const intent of intents) {
    const { state } = install({
      bibleVersionCount: 0,
      project: project({ story_bible: { ...READY_BIBLE } }),
    });
    await assert.rejects(
      () => submitAnimeCommand({ idempotencyKey: key(), userId: USER, requestId: `req-gate-${intent}`, body: body(intent) }),
      (error) => error.code === 'STAGE_DEPENDENCY_BLOCKED' && /bible_approval/.test(String(error.message)),
      intent
    );
    assert.equal(state.calls.filter((call) => call.table === 'api_commands' && call.action === 'insert').length, 0);
  }
});

test('production setup gate blocks a project without cast', async () => {
  const { state } = install({ castCount: 0 });
  await assert.rejects(
    () => submitAnimeCommand({ idempotencyKey: key(), userId: USER, requestId: 'req-gate-cast', body: body('GENERATE_EPISODE') }),
    (error) => {
      assert.equal(error.code, 'STAGE_DEPENDENCY_BLOCKED');
      assert.deepEqual(error.missing, ['characters']);
      assert.equal(error.deep_link, 'characters');
      return true;
    }
  );
  assert.equal(state.calls.filter((call) => call.table === 'api_commands' && call.action === 'insert').length, 0);
});
