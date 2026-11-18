'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const { decideApproval } = H.dist('modules/anime/approvals/approvals.service.js');

const PROJECT = '11111111-1111-4111-8111-111111111111';
const APPROVAL = '33333333-3333-4333-8333-333333333333';
const ACTOR = 'owner-2';

function row(overrides = {}) {
  return {
    id: APPROVAL,
    project_id: PROJECT,
    type: 'CANON_CHANGE',
    resource_id: '4',
    resource_version: 1,
    requested_by: 'owner-1',
    approver_role: 'owner',
    exact_diff: { proposed_events: ['A happens'], episode_no: 4, season_no: 1 },
    risk: 'MEDIUM',
    cost_ceiling: null,
    expires_at: null,
    status: 'PENDING',
    decision: null,
    decision_reason: null,
    decision_by: null,
    decided_at: null,
    decision_idempotency_key: null,
    audit_event_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function install(existing, updateRow) {
  return installFakeSupabase(async (call) => {
    if (call.table === 'approval_decisions' && call.action === 'select') return { data: existing, error: null };
    if (call.table === 'approval_decisions' && call.action === 'update') return { data: updateRow, error: null };
    return { data: null, error: null };
  }, (name, args) => ({
    data: {
      id: args.p_command_id,
      project_id: args.p_project_id,
      user_id: args.p_user_id,
      intent: args.p_intent,
      payload: args.p_payload,
      status: args.p_status,
      idempotency_key: args.p_idempotency_key,
      body_hash: args.p_body_hash,
    },
    error: null,
  }));
}

test('canon approval submits exactly one canon command under the decision idempotency key', async () => {
  const approved = row({ status: 'APPROVED', decision: 'APPROVED', decision_idempotency_key: 'decision-key' });
  const { state } = install(row(), approved);
  const result = await decideApproval({
    project_id: PROJECT,
    approval_id: APPROVAL,
    decision: 'APPROVED',
    expected_resource_version: 1,
    reason: 'canon is correct',
    actor_user_id: ACTOR,
    request_id: 'req-1',
    idempotency_key: 'decision-key',
  });
  assert.equal(result.status, 'APPROVED');
  assert.equal(state.rpcCalls.length, 1);
  assert.equal(state.rpcCalls[0].name, 'insert_anime_command_atomic');
  assert.equal(state.rpcCalls[0].args.p_intent, 'APPROVE_CANON_CHANGE');
  assert.equal(state.rpcCalls[0].args.p_idempotency_key, 'decision-key');
  assert.equal(state.rpcCalls[0].args.p_payload.episode_no, 4);
});

test('same decision idempotency key replays without double-submitting the command', async () => {
  const approved = row({ status: 'APPROVED', decision: 'APPROVED', decision_idempotency_key: 'decision-key' });
  const { state } = install(approved, approved);
  const result = await decideApproval({
    project_id: PROJECT,
    approval_id: APPROVAL,
    decision: 'APPROVED',
    expected_resource_version: 1,
    reason: 'retry',
    actor_user_id: ACTOR,
    request_id: 'req-1',
    idempotency_key: 'decision-key',
  });
  assert.equal(result.status, 'APPROVED');
  assert.equal(state.calls.filter((call) => call.table === 'approval_decisions' && call.action === 'update').length, 0);
  assert.equal(state.rpcCalls.length, 1);
  assert.equal(state.rpcCalls[0].args.p_idempotency_key, 'decision-key');
});

test('a different idempotency key cannot overwrite a decided approval', async () => {
  const approved = row({ status: 'APPROVED', decision: 'APPROVED', decision_idempotency_key: 'decision-key' });
  install(approved, approved);
  await assert.rejects(() => decideApproval({
    project_id: PROJECT,
    approval_id: APPROVAL,
    decision: 'APPROVED',
    expected_resource_version: 1,
    reason: 'different retry',
    actor_user_id: ACTOR,
    request_id: 'req-1',
    idempotency_key: 'other-key',
  }), (error) => error.httpStatus === 409);
});

test('approved non-canon approvals do not submit a canon command', async () => {
  const publish = row({ type: 'PUBLISH', status: 'APPROVED', decision: 'APPROVED', decision_idempotency_key: 'publish-key' });
  const { state } = install(publish, publish);
  const result = await decideApproval({
    project_id: PROJECT,
    approval_id: APPROVAL,
    decision: 'APPROVED',
    expected_resource_version: 1,
    reason: 'publish',
    actor_user_id: ACTOR,
    request_id: 'req-1',
    idempotency_key: 'publish-key',
  });
  assert.equal(result.status, 'APPROVED');
  assert.equal(state.rpcCalls.length, 0);
});
