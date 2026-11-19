'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const { buildDirectorTimeline } = H.dist('modules/ai/director/director.timeline.js');

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const COMMAND = '33333333-3333-4333-8333-333333333333';

const fastify = { log: { debug() {} } };
const auth = { userId: USER };

function install(command, job) {
  return installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') return { data: command, error: null };
    if (call.table === 'pending_actions' && call.action === 'select') return { data: job, error: null };
    if (call.table === 'episodes' && call.action === 'select') return { data: null, error: null };
    if (call.table === 'clips' && call.action === 'select') return { data: [], error: null, count: 0 };
    return { data: null, error: null };
  });
}

test('timeline exposes failure reason and retry eligibility for failed production commands', async () => {
  install(
    { id: COMMAND, intent: 'GENERATE_EPISODE', status: 'FAILED', payload: { season_no: 1, episode_no: 2 } },
    { status: 'failed', last_error: 'Provider timed out after 3 attempts', retry_count: 3 }
  );

  const timeline = await buildDirectorTimeline(fastify, auth, { projectId: PROJECT, commandId: COMMAND });

  assert.equal(timeline.command_status, 'FAILED');
  assert.deepEqual(timeline.job, {
    status: 'failed',
    failure_reason: 'Provider timed out after 3 attempts',
    retry_count: 3,
    retryable: true,
  });
  assert.equal(timeline.stages.find((stage) => stage.status === 'failed')?.key, 'PLAN');
});

test('timeline does not offer retry for completed commands', async () => {
  install(
    { id: COMMAND, intent: 'GENERATE_EPISODE', status: 'SUCCEEDED', payload: { season_no: 1, episode_no: 1 } },
    { status: 'succeeded', last_error: null, retry_count: 0 }
  );

  const timeline = await buildDirectorTimeline(fastify, auth, { projectId: PROJECT, commandId: COMMAND });

  assert.equal(timeline.job?.retryable, false);
  assert.equal(timeline.job?.failure_reason, null);
});
