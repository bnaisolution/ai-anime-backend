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

function install(commandRow, pendingActions = [], episodeState = null) {
  return installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') {
      return { data: commandRow, error: null };
    }
    if (call.table === 'episode_states' && call.action === 'select') {
      return { data: episodeState, error: null };
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

test('PUBLISH_NOW does not report success without publish evidence', async () => {
  const { state } = install(command({ intent: 'PUBLISH_NOW' }), [], { current_state: 'QC_PASSED', episode_no: 1 });
  const result = await reconcileCommand({
    project_id: PROJECT,
    command_id: COMMAND,
    callback_payload: { status: 'COMPLETED' },
  });
  assert.equal(result.next_status, 'RECONCILING');
  const update = state.calls.find((call) => call.table === 'api_commands' && call.action === 'update');
  assert.equal(update.payload.status, 'RECONCILING');
});

test('PUBLISH_NOW succeeds only when the episode is published', async () => {
  const { state } = install(command({ intent: 'PUBLISH_NOW' }), [], { current_state: 'PUBLISHED', episode_no: 1 });
  const result = await reconcileCommand({
    project_id: PROJECT,
    command_id: COMMAND,
    callback_payload: { status: 'COMPLETED' },
  });
  assert.equal(result.next_status, 'SUCCEEDED');
  assert.equal(state.calls.find((call) => call.table === 'api_commands' && call.action === 'update').payload.status, 'SUCCEEDED');
});

test('PUBLISH_NOW accepts an explicit published callback before episode state catches up', async () => {
  const { state } = install(command({ intent: 'PUBLISH_NOW' }), [], { current_state: 'QC_PASSED', episode_no: 1 });
  const result = await reconcileCommand({
    project_id: PROJECT,
    command_id: COMMAND,
    callback_payload: { status: 'COMPLETED', publish_status: 'PUBLISHED' },
  });
  assert.equal(result.next_status, 'SUCCEEDED');
  assert.equal(state.calls.find((call) => call.table === 'api_commands' && call.action === 'update').payload.status, 'SUCCEEDED');
});

test('reconcileCommand reads master media nested under callback.result (WF-03 shape)', async () => {
  const existing = { output_media: { thumbnail_url: 'https://cdn/thumb.jpg', telegram_file_id: 'tg-old' } };
  const rpcCalls = [];
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') {
      return { data: command({ intent: 'GENERATE_EPISODE', payload: { episode_no: 2, season_no: 3 } }), error: null };
    }
    if (call.table === 'episode_states' && call.action === 'select') return { data: { current_state: 'MIXED', episode_no: 2 }, error: null };
    if (call.table === 'pending_actions' && call.action === 'select') return { data: [], error: null };
    if (call.table === 'episodes' && call.action === 'select') return { data: existing, error: null };
    return { data: null, error: null };
  }, (name, args) => {
    rpcCalls.push({ name, args });
    return { data: { id: args.p_command_id }, error: null };
  });
  const result = await reconcileCommand({
    project_id: PROJECT,
    command_id: COMMAND,
    callback_payload: {
      status: 'COMPLETED',
      result: {
        status: 'MIXED',
        qc_status: 'PENDING',
        final_video_url: 'https://cdn/master.mp4',
        output_media: {
          master_video_url: 'https://cdn/master.mp4',
          actual_duration_sec: 600,
          target_duration_sec: 600,
          file_size_bytes: 12345,
          telegram_file_id: 'tg-new',
          duration_status: 'PASS',
        },
        audio_stats: { mean_volume_db: -14.2, max_volume_db: -0.5, clipping_detected: false, measured: true },
      },
    },
  });
  assert.equal(result.next_status, 'SUCCEEDED');
  const episodeUpdate = state.calls.find((call) => call.table === 'episodes' && call.action === 'update');
  assert.equal(episodeUpdate.payload.output_media.final_video_url, 'https://cdn/master.mp4');
  assert.equal(episodeUpdate.payload.output_media.duration_sec, 600);
  assert.equal(episodeUpdate.payload.output_media.file_size_bytes, 12345);
  assert.equal(episodeUpdate.payload.output_media.telegram_file_id, 'tg-new');
  assert.equal(episodeUpdate.payload.output_media.thumbnail_url, 'https://cdn/thumb.jpg');
  assert.deepEqual(episodeUpdate.payload.output_media.audio_stats, {
    mean_volume_db: -14.2,
    max_volume_db: -0.5,
    clipping_detected: false,
    measured: true,
  });
  const filters = episodeUpdate.filters.filter((filter) => filter.op === 'eq').map((filter) => [filter.col, filter.value]);
  assert.deepEqual(filters, [['project_id', PROJECT], ['season_no', 3], ['episode_no', 2]]);
  const autoQc = rpcCalls.find((call) => call.name === 'insert_anime_command_atomic');
  assert.ok(autoQc, 'auto QC command must be enqueued');
  assert.equal(autoQc.args.p_intent, 'RUN_QC');
  assert.equal(autoQc.args.p_payload.season_no, 3);
  assert.equal(autoQc.args.p_payload.episode_no, 2);
  assert.equal(autoQc.args.p_payload.media_url, 'https://cdn/master.mp4');
});

test('reconcileCommand does not enqueue auto QC without a real master URL', async () => {
  const rpcCalls = [];
  installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') {
      return { data: command({ intent: 'GENERATE_EPISODE', payload: { episode_no: 1, season_no: 1 } }), error: null };
    }
    if (call.table === 'episode_states' && call.action === 'select') return { data: { current_state: 'MIXED', episode_no: 1 }, error: null };
    if (call.table === 'pending_actions' && call.action === 'select') return { data: [], error: null };
    return { data: null, error: null };
  }, (name, args) => {
    rpcCalls.push({ name, args });
    return { data: null, error: null };
  });
  await reconcileCommand({ project_id: PROJECT, command_id: COMMAND, callback_payload: { status: 'COMPLETED' } });
  assert.equal(rpcCalls.length, 0);
});


test('reconcileCommand schedules a durable outbox retry when auto QC enqueue fails', async () => {
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') {
      return { data: command({ intent: 'GENERATE_EPISODE', payload: { episode_no: 2, season_no: 3 } }), error: null };
    }
    if (call.table === 'episode_states' && call.action === 'select') return { data: { current_state: 'MIXED', episode_no: 2 }, error: null };
    if (call.table === 'pending_actions' && call.action === 'select') return { data: [], error: null };
    if (call.table === 'episodes' && call.action === 'select') return { data: null, error: null };
    return { data: null, error: null };
  }, () => ({ data: null, error: { code: 'XX000', message: 'atomic insert unavailable' } }));

  await reconcileCommand({
    project_id: PROJECT,
    command_id: COMMAND,
    callback_payload: {
      status: 'COMPLETED',
      result: {
        final_video_url: 'https://cdn/master.mp4',
        output_media: { file_size_bytes: 12345, actual_duration_sec: 600 },
      },
    },
  });

  const retry = state.calls.find((call) => call.table === 'outbox_events' && call.action === 'insert');
  assert.ok(retry, 'auto QC retry event must be inserted');
  assert.equal(retry.payload.type, 'auto_qc_enqueue');
  assert.equal(retry.payload.payload.intent, 'RUN_QC');
  assert.equal(retry.payload.payload.season_no, 3);
  assert.equal(retry.payload.payload.episode_no, 2);
  assert.equal(retry.payload.payload.command_payload.media_url, 'https://cdn/master.mp4');
});
