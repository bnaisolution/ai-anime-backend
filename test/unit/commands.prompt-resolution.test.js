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

function episodePromptHandler(options = {}) {
  let rpcArgs;
  const { state } = installFakeSupabase(async (call) => {
    if (call.table === 'api_commands' && call.action === 'select') return { data: null, error: null };
    if (call.table === 'projects' && call.action === 'select') {
      return {
        data: { id: PROJECT, visual_medium: 'ANIME', active_system_prompt_id: 'bible-active' },
        error: null,
      };
    }
    if (call.table === 'episodes' && call.action === 'select') {
      return {
        data: { script_json: { prompt_id: options.episodePromptId ?? 'episode-7' } },
        error: null,
      };
    }
    if (call.table === 'user_system_prompts' && call.action === 'select') {
      if (hasFilter(call, 'eq', 'prompt_category', 'IMAGE')) return { data: [], error: null };
      const idFilter = call.filters.find((filter) => filter.op === 'eq' && filter.col === 'id');
      const userFilter = call.filters.find((filter) => filter.op === 'eq' && filter.col === 'user_id');
      if (idFilter?.value === 'episode-7' && userFilter?.value === USER) {
        return {
          data: [{
            id: 'episode-7',
            title: 'Episode Override',
            visual_medium: 'ANIME',
            prompt_text: 'Episode-specific override prompt',
            prompt_category: 'EPISODE',
          }],
          error: null,
        };
      }
      if (idFilter?.value === 'bible-active') {
        return {
          data: [{
            id: 'bible-active',
            title: 'Active Bible',
            visual_medium: 'ANIME',
            prompt_text: 'Project bible prompt',
            prompt_category: 'BIBLE',
          }],
          error: null,
        };
      }
      return { data: [], error: null };
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
  return { state, getRpcArgs: () => rpcArgs };
}

test('episode dispatch resolves owned EPISODE override and reports it in payload', async () => {
  const { state, getRpcArgs } = episodePromptHandler();
  await submitAnimeCommand({
    idempotencyKey: `episode-override-${Date.now()}`,
    userId: USER,
    requestId: 'req-episode-override',
    body: {
      intent: 'GENERATE_EPISODE',
      project_id: PROJECT,
      episode_no: 4,
      payload: { synopsis: 'Override test' },
    },
  });

  const payload = getRpcArgs().p_payload;
  assert.equal(payload.system_prompt_id, 'episode-7');
  assert.equal(payload.system_prompt_category, 'EPISODE');
  assert.equal(payload.episode_prompt_override, true);
  assert.equal(payload.custom_system_prompt, 'Episode-specific override prompt');
  assert.equal(payload.system_prompt_config.id, 'episode-7');
  assert.equal(payload.system_prompt_config.episode_override, true);

  const episodeQuery = state.calls.find((call) => call.table === 'episodes' && call.action === 'select');
  assert.ok(episodeQuery, 'episode override query was issued');
  assert.ok(hasFilter(episodeQuery, 'eq', 'project_id', PROJECT));
  assert.ok(hasFilter(episodeQuery, 'eq', 'episode_no', 4));
  const promptQuery = state.calls.find(
    (call) => call.table === 'user_system_prompts' && hasFilter(call, 'eq', 'id', 'episode-7')
  );
  assert.ok(promptQuery, 'episode prompt lookup was issued');
  assert.ok(hasFilter(promptQuery, 'eq', 'user_id', USER));
  assert.ok(hasFilter(promptQuery, 'eq', 'is_archived', false));
});

test('missing or cross-tenant episode override falls back to the project Bible prompt', async () => {
  const { getRpcArgs } = episodePromptHandler({ episodePromptId: 'other-user-prompt' });
  await submitAnimeCommand({
    idempotencyKey: `episode-fallback-${Date.now()}`,
    userId: USER,
    requestId: 'req-episode-fallback',
    body: {
      intent: 'REGENERATE_EPISODE',
      project_id: PROJECT,
      episode_no: 2,
      payload: { synopsis: 'Fallback test' },
    },
  });

  const payload = getRpcArgs().p_payload;
  assert.equal(payload.system_prompt_id, 'bible-active');
  assert.equal(payload.system_prompt_category, 'BIBLE');
  assert.equal(payload.episode_prompt_override, false);
  assert.equal(payload.custom_system_prompt, 'Project bible prompt');
});

test('non-episode workflows ignore stored episode prompt overrides', async () => {
  const { state, getRpcArgs } = episodePromptHandler();
  await submitAnimeCommand({
    idempotencyKey: `episode-non-wf02-${Date.now()}`,
    userId: USER,
    requestId: 'req-episode-non-wf02',
    body: {
      intent: 'CREATE_PROJECT',
      project_id: PROJECT,
      episode_no: 4,
      payload: { name: 'No override' },
    },
  });

  const payload = getRpcArgs().p_payload;
  assert.equal(payload.system_prompt_id, 'bible-active');
  assert.equal(payload.episode_prompt_override, false);
  assert.equal(state.calls.some((call) => call.table === 'episodes' && call.action === 'select'), false);
});
