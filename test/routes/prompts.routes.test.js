'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const { buildApp, signFor } = require('../helpers/app');

const OWNER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const PROMPT = '77777777-7777-4777-8777-777777777777';

function promptRow(overrides = {}) {
  return {
    id: PROMPT,
    user_id: OWNER,
    project_id: null,
    title: 'Bible Prompt',
    visual_medium: 'ANIME',
    prompt_category: 'BIBLE',
    genre: 'Action',
    format: 'SERIES',
    model_hint: 'DEFAULT',
    tags: [],
    is_favorite: false,
    is_archived: false,
    version: 1,
    prompt_text: 'Write a bible',
    ...overrides,
  };
}

function makeHandler() {
  return async (call) => {
    if (call.table === 'token_blacklist') return { data: null, error: null };
    if (call.table === 'projects' && call.action === 'select') {
      return { data: { id: PROJECT, user_id: OWNER, visual_medium: 'ANIME', active_system_prompt_id: null }, error: null };
    }
    if (call.table === 'user_system_prompts' && call.action === 'select') {
      if (call.mode === 'maybeSingle' || call.mode === 'single') return { data: promptRow(), error: null };
      return { data: [promptRow()], error: null };
    }
    if (call.table === 'prompt_versions' && call.action === 'select') {
      return { data: [{ id: 'v1', prompt_id: PROMPT, version: 1, title: 'Bible Prompt' }], error: null };
    }
    if (call.action === 'insert') return { data: { id: PROMPT, ...call.payload }, error: null };
    if (call.action === 'upsert') return { data: { id: 'assoc', ...call.payload }, error: null };
    if (call.action === 'update') return { data: { id: PROMPT, ...call.payload }, error: null };
    if (call.action === 'select') return { data: [], error: null };
    return { data: null, error: null };
  };
}

async function withApp(fn) {
  const { app, fake } = await buildApp({ supabaseHandler: makeHandler() });
  try {
    await fn(app, fake);
  } finally {
    await app.close();
  }
}

function auth(app) {
  return { authorization: `Bearer ${signFor(app, OWNER)}` };
}

test('prompt compatibility validation rejects incompatible medium/model pairs', async () => {
  await withApp(async (app) => {
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/anime/prompts/validate-compatibility',
      headers: auth(app),
      payload: { visual_medium: 'REAL_HUMAN', model_hint: 'ANIMATEDIFF' },
    });
    assert.equal(bad.statusCode, 200);
    assert.equal(bad.json().data.compatible, false);

    const good = await app.inject({
      method: 'POST',
      url: '/v1/anime/prompts/validate-compatibility',
      headers: auth(app),
      payload: { genre: 'Action', format: 'SERIES', visual_medium: 'ANIME', model_hint: 'SDXL' },
    });
    assert.equal(good.statusCode, 200);
    assert.equal(good.json().data.compatible, true);
  });
});

test('prompt search applies tenant, category, favorite, archive, and text filters', async () => {
  await withApp(async (app, fake) => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/anime/prompts?prompt_category=BIBLE&q=bible&is_favorite=true',
      headers: auth(app),
    });
    assert.equal(response.statusCode, 200);
    const call = fake.state.calls.find((entry) => entry.table === 'user_system_prompts' && entry.action === 'select');
    assert.ok(call);
    assert.ok(call.filters.some((filter) => filter.op === 'eq' && filter.col === 'user_id' && filter.value === OWNER));
    assert.ok(call.filters.some((filter) => filter.op === 'eq' && filter.col === 'prompt_category' && filter.value === 'BIBLE'));
    assert.ok(call.filters.some((filter) => filter.op === 'eq' && filter.col === 'is_archived' && filter.value === false));
    assert.ok(call.filters.some((filter) => filter.op === 'eq' && filter.col === 'is_favorite' && filter.value === true));
    assert.ok(call.filters.some((filter) => filter.op === 'or' && String(filter.value).includes('ilike')));
  });
});

test('saving a prompt never mutates the project visual medium', async () => {
  await withApp(async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/prompts',
      headers: auth(app),
      payload: {
        project_id: PROJECT,
        title: 'Bible Prompt',
        visual_medium: 'MANHWA',
        prompt_category: 'BIBLE',
        genre: 'Action',
        format: 'SERIES',
        prompt_text: 'Write a bible',
        set_active: true,
      },
    });
    assert.equal(response.statusCode, 201);
    const projectUpdate = fake.state.calls.find((entry) => entry.table === 'projects' && entry.action === 'update');
    assert.ok(projectUpdate);
    assert.equal(projectUpdate.payload.active_system_prompt_id, PROMPT);
    assert.equal(Object.prototype.hasOwnProperty.call(projectUpdate.payload, 'visual_medium'), false);
    assert.ok(fake.state.calls.some((entry) => entry.table === 'project_prompt_associations' && entry.action === 'upsert'));
  });
});

test('prompt PATCH updates only owned rows', async () => {
  await withApp(async (app, fake) => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/anime/prompts/${PROMPT}`,
      headers: auth(app),
      payload: { title: 'Renamed', is_favorite: true },
    });
    assert.equal(response.statusCode, 200);
    const update = fake.state.calls.find((entry) => entry.table === 'user_system_prompts' && entry.action === 'update');
    assert.ok(update);
    assert.deepEqual(update.payload, { title: 'Renamed', is_favorite: true });
    assert.ok(update.filters.some((filter) => filter.op === 'eq' && filter.col === 'user_id' && filter.value === OWNER));
  });
});

test('favorite toggle flips the stored value for the owner', async () => {
  await withApp(async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/anime/prompts/${PROMPT}/favorite`,
      headers: auth(app),
    });
    assert.equal(response.statusCode, 200);
    const update = fake.state.calls.find((entry) => entry.table === 'user_system_prompts' && entry.action === 'update');
    assert.deepEqual(update.payload, { is_favorite: true });
  });
});

test('prompt version history is tenant scoped', async () => {
  await withApp(async (app, fake) => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/anime/prompts/${PROMPT}/versions`,
      headers: auth(app),
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.length, 1);
    const versionsCall = fake.state.calls.find((entry) => entry.table === 'prompt_versions');
    assert.ok(versionsCall.filters.some((filter) => filter.op === 'eq' && filter.col === 'user_id' && filter.value === OWNER));
  });
});

test('project creation associates selected prompts and activates the Bible prompt', async () => {
  await withApp(async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/projects',
      headers: auth(app),
      payload: { name: 'Batch 2 Project', prompt_ids: [PROMPT] },
    });
    assert.equal(response.statusCode, 201);
    const association = fake.state.calls.find(
      (entry) => entry.table === 'project_prompt_associations' && entry.action === 'upsert'
    );
    assert.ok(association, 'project prompt association is written');
    const projectUpdate = fake.state.calls.find(
      (entry) => entry.table === 'projects' && entry.action === 'update'
    );
    assert.ok(projectUpdate, 'active Bible prompt is activated');
    assert.equal(projectUpdate.payload.active_system_prompt_id, PROMPT);
  });
});
