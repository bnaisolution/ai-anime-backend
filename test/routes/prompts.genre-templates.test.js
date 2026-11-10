'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const { buildApp, signFor } = require('../helpers/app');

const OWNER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const PROMPT = '77777777-7777-4777-8777-777777777777';

function makeHandler() {
  return async (call) => {
    if (call.table === 'token_blacklist') return { data: null, error: null };
    if (call.table === 'projects' && call.action === 'select') {
      return { data: { id: PROJECT, user_id: OWNER, visual_medium: 'ANIME', active_system_prompt_id: null }, error: null };
    }
    if (call.table === 'user_system_prompts' && call.action === 'select') {
      if (call.mode === 'maybeSingle' || call.mode === 'single') return { data: null, error: null };
      return { data: [], error: null };
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

test('prompt library metadata exposes required genre templates and visual media', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/anime/prompts/library/meta',
      headers: auth(app),
    });
    assert.equal(response.statusCode, 200);
    const data = response.json().data;
    const requiredGenres = ['Horror', 'Thriller', 'Romance', 'Comedy', 'Action', 'Mythology'];
    for (const genre of requiredGenres) {
      assert.ok(data.genres.includes(genre), `missing genre ${genre}`);
      assert.ok(data.genre_templates.some((template) => template.genre === genre), `missing template ${genre}`);
    }
    for (const medium of ['ANIME', 'REAL_HUMAN', 'LIVE_ACTION', 'CINEMATIC']) {
      assert.ok(data.media.includes(medium), `missing medium ${medium}`);
    }
    assert.ok(data.genre_templates.every((template) => template.prompt_text.length > 20));
  });
});

test('prompt creation persists approved genre and format metadata', async () => {
  await withApp(async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/prompts',
      headers: auth(app),
      payload: {
        project_id: PROJECT,
        title: 'Mythology Film Prompt',
        visual_medium: 'CINEMATIC',
        prompt_category: 'BIBLE',
        genre: 'Mythology',
        format: 'MOVIE',
        model_hint: 'DEFAULT',
        prompt_text: 'Treat myth as lived belief with ritual and divine cost.',
      },
    });
    assert.equal(response.statusCode, 201);
    const insert = fake.state.calls.find((entry) => entry.table === 'user_system_prompts' && entry.action === 'insert');
    assert.ok(insert);
    const row = Array.isArray(insert.payload) ? insert.payload[0] : insert.payload;
    assert.equal(row.genre, 'Mythology');
    assert.equal(row.format, 'MOVIE');
    assert.equal(row.visual_medium, 'CINEMATIC');
  });
});

test('prompt list forwards genre and format filters to the tenant-scoped query', async () => {
  await withApp(async (app, fake) => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/anime/prompts?project_id=' + PROJECT + '&genre=Thriller&format=SERIES',
      headers: auth(app),
    });
    assert.equal(response.statusCode, 200);
    const call = fake.state.calls.find((entry) => entry.table === 'user_system_prompts' && entry.action === 'select');
    assert.ok(call);
    assert.ok(call.filters.some((filter) => filter.op === 'eq' && filter.col === 'user_id' && filter.value === OWNER));
    assert.ok(call.filters.some((filter) => filter.op === 'eq' && filter.col === 'genre' && filter.value === 'Thriller'));
    assert.ok(call.filters.some((filter) => filter.op === 'eq' && filter.col === 'format' && filter.value === 'SERIES'));
  });
});

test('genre compatibility rejects a trailer for romance while allowing cinematic horror', async () => {
  await withApp(async (app) => {
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/anime/prompts/validate-compatibility',
      headers: auth(app),
      payload: { genre: 'Romance', format: 'TRAILER', visual_medium: 'CINEMATIC' },
    });
    assert.equal(bad.statusCode, 200);
    assert.equal(bad.json().data.compatible, false);

    const good = await app.inject({
      method: 'POST',
      url: '/v1/anime/prompts/validate-compatibility',
      headers: auth(app),
      payload: { genre: 'Horror', format: 'SERIES', visual_medium: 'CINEMATIC', model_hint: 'DEFAULT' },
    });
    assert.equal(good.statusCode, 200);
    assert.equal(good.json().data.compatible, true);
  });
});
