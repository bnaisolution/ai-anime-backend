'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const MASTER_KEY = 'stage4-test-encryption-key-32-bytes';
process.env.ANIME_ENCRYPTION_KEY = MASTER_KEY;

const { encryptConfig } = H.dist('modules/anime/infrastructure/infrastructure.crypto.js');
const { submitAnimeCommand } = H.dist('modules/anime/commands/commands.service.js');

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';

test('command hydration decrypts config_encrypted and never forwards plaintext config rows', async () => {
  const encrypted = encryptConfig(JSON.stringify({
    api_key: 'provider-secret',
    gpu_routing: { mode: 'KAGGLE_AUTO' },
    telegram_storage: { chat_id: '123' },
  }), MASTER_KEY);
  let rpcArgs;
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') return { data: null, error: null };
    if (call.table === 'projects' && call.action === 'select') {
      return { data: { id: PROJECT, visual_medium: 'ANIME', active_system_prompt_id: null }, error: null };
    }
    if (call.table === 'user_system_prompts' && call.action === 'select') return { data: [], error: null };
    if (call.table === 'user_infrastructure' && call.action === 'select') {
      return {
        data: [{ provider_type: 'groq', config_encrypted: encrypted, status: 'active' }],
        error: null,
      };
    }
    return { data: null, error: null };
  }, (name, args) => {
    rpcArgs = args;
    return {
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
    };
  });

  await submitAnimeCommand({
    idempotencyKey: `hydration-${Date.now()}`,
    userId: USER,
    requestId: 'req-hydration',
    body: {
      intent: 'CREATE_PROJECT',
      project_id: PROJECT,
      payload: { name: 'Hydrated' },
    },
  });

  assert.ok(rpcArgs, 'atomic insert RPC was called');
  assert.equal(rpcArgs.p_outbox_payload.user_infrastructure.groq.api_key, 'provider-secret');
  assert.deepEqual(rpcArgs.p_outbox_payload.gpu_routing, { mode: 'KAGGLE_AUTO' });
  assert.deepEqual(rpcArgs.p_outbox_payload.telegram_storage, { chat_id: '123' });
  assert.equal(rpcArgs.p_payload.user_infrastructure.groq.api_key, 'provider-secret');
  const infraSelect = state.calls.find((call) => call.table === 'user_infrastructure' && call.action === 'select');
  assert.ok(infraSelect.filters.some((filter) => filter.op === 'eq' && filter.col === 'user_id' && filter.value === USER));
});
