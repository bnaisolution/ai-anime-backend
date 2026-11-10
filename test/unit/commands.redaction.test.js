'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const { submitAnimeCommand, getAnimeCommandForUser } = H.dist('modules/anime/commands/commands.service.js');

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const COMMAND = '33333333-3333-4333-8333-333333333333';

test('command submission response redacts provider secrets from the stored payload', async () => {
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') return { data: null, error: null };
    if (call.table === 'projects' && call.action === 'select') {
      return { data: { id: PROJECT, visual_medium: 'ANIME', active_system_prompt_id: null }, error: null };
    }
    if (call.table === 'user_system_prompts' && call.action === 'select') return { data: [], error: null };
    if (call.table === 'user_infrastructure' && call.action === 'select') return { data: [], error: null };
    return { data: null, error: null };
  }, (_name, args) => ({
    data: {
      id: args.p_command_id,
      project_id: args.p_project_id,
      user_id: args.p_user_id,
      intent: args.p_intent,
      status: args.p_status,
      idempotency_key: args.p_idempotency_key,
      body_hash: args.p_body_hash,
      payload: args.p_payload,
      created_at: new Date().toISOString(),
    },
    error: null,
  }));

  const result = await submitAnimeCommand({
    idempotencyKey: `redaction-${Date.now()}`,
    userId: USER,
    requestId: 'req-redaction',
    body: {
      intent: 'CREATE_PROJECT',
      project_id: PROJECT,
      payload: {
        name: 'Redacted',
        nested: { api_key: 'nested-secret', keep: 'visible' },
      },
      user_infrastructure: { groq: { api_key: 'provider-secret' } },
    },
  });

  const payload = result.command.payload;
  assert.equal(payload.user_infrastructure, undefined);
  assert.equal(payload.gpu_routing, undefined);
  assert.equal(payload.telegram_storage, undefined);
  assert.equal(payload.nested.api_key, undefined);
  assert.equal(payload.nested.keep, 'visible');
  assert.ok(state.calls.some((call) => call.table === 'api_commands'));
});

test('command read response redacts provider secrets and keeps non-secret fields', async () => {
  installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') {
      return {
        data: {
          id: COMMAND,
          project_id: PROJECT,
          user_id: USER,
          intent: 'CREATE_PROJECT',
          status: 'SUCCEEDED',
          idempotency_key: 'key',
          body_hash: 'hash',
          payload: {
            episode_no: 1,
            user_infrastructure: { groq: { api_key: 'provider-secret' } },
            provider: { access_token: 'token-value', model: 'groq-fast' },
          },
          created_at: new Date().toISOString(),
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });

  const command = await getAnimeCommandForUser(COMMAND, USER);
  assert.equal(command.payload.user_infrastructure, undefined);
  assert.equal(command.payload.provider.access_token, undefined);
  assert.equal(command.payload.provider.model, 'groq-fast');
  assert.equal(command.payload.episode_no, 1);
});
