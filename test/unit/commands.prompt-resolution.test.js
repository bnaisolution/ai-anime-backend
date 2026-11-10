'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

const { submitAnimeCommand } = H.dist('modules/anime/commands/commands.service.js');

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';

function hasFilter(call, op, col, value) {
  return call.filters.some((filter) => filter.op === op && filter.col === col && filter.value === value);
}

test('command hydration resolves tenant scoped Bible and IMAGE prompts', async () => {
  let rpcArgs;
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') return { data: null, error: null };
    if (call.table === 'projects' && call.action === 'select') {
      return {
        data: { id: PROJECT, visual_medium: 'MANHWA', active_system_prompt_id: 'bible-active' },
        error: null,
      };
    }
    if (call.table === 'user_system_prompts' && call.action === 'select') {
      if (hasFilter(call, 'eq', 'prompt_category', 'IMAGE')) {
        return {
          data: [{ id: 'image-1', title: 'Image Prompt', prompt_text: 'Cinematic manhwa keyframe' }],
          error: null,
        };
      }
      return {
        data: [{
          id: 'bible-active',
          title: 'Active Bible',
          visual_medium: 'MANHWA',
          prompt_text: 'Locked canon bible',
          prompt_category: 'BIBLE',
        }],
        error: null,
      };
    }
    if (call.table === 'user_infrastructure' && call.action === 'select') return { data: [], error: null };
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
    idempotencyKey: `prompt-resolution-${Date.now()}`,
    userId: USER,
    requestId: 'req-prompt-resolution',
    body: {
      intent: 'CREATE_PROJECT',
      project_id: PROJECT,
      payload: { name: 'Prompt Resolution' },
    },
  });

  assert.ok(rpcArgs, 'atomic insert RPC was called');
  assert.equal(rpcArgs.p_payload.image_system_prompt, 'Cinematic manhwa keyframe');
  assert.equal(rpcArgs.p_payload.image_prompt_config.prompt_text, 'Cinematic manhwa keyframe');
  assert.equal(rpcArgs.p_payload.image_prompt_config.visual_medium, 'MANHWA');
  assert.equal(rpcArgs.p_payload.custom_system_prompt, 'Locked canon bible');
  assert.equal(rpcArgs.p_payload.system_prompt_config.title, 'Active Bible');

  const imageSelect = state.calls.find(
    (call) => call.table === 'user_system_prompts' && hasFilter(call, 'eq', 'prompt_category', 'IMAGE')
  );
  assert.ok(imageSelect, 'IMAGE prompt query was issued');
  assert.ok(hasFilter(imageSelect, 'eq', 'user_id', USER));
  assert.ok(hasFilter(imageSelect, 'eq', 'is_archived', false));
  assert.ok(imageSelect.filters.some((filter) => filter.op === 'or' && String(filter.value).includes('project_id')));

  const bibleSelect = state.calls.find(
    (call) => call.table === 'user_system_prompts' && hasFilter(call, 'eq', 'id', 'bible-active')
  );
  assert.ok(bibleSelect, 'active Bible prompt query was issued');
  assert.ok(hasFilter(bibleSelect, 'eq', 'user_id', USER));
});
