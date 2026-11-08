'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { afterEach } = require('node:test');
require('../helpers/env');
const { buildApp, signFor } = require('../helpers/app');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const FILE_ID = 'AgACAgQAAxkBAAIBY2F0ZmlsZTE';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
});

function mediaHandler(options = {}) {
  const clipProjectId = Object.prototype.hasOwnProperty.call(options, 'clipProjectId') ? options.clipProjectId : null;
  const episodeProjectId = Object.prototype.hasOwnProperty.call(options, 'episodeProjectId') ? options.episodeProjectId : null;
  const published = options.published === true;
  const projectOwner = Object.prototype.hasOwnProperty.call(options, 'projectOwner') ? options.projectOwner : OWNER;

  return async (call) => {
    if (call.table === 'episodes' && call.action === 'select') {
      const matches = call.filters.some((filter) =>
        filter.op === 'eq' &&
        (filter.col === 'telegram_file_id' || filter.col === 'output_media->>telegram_file_id') &&
        filter.value === FILE_ID
      );
      return {
        data: matches && episodeProjectId ? [{
          project_id: episodeProjectId,
          current_state: published ? 'PUBLISHED' : 'MIXED',
          published_at: published ? '2026-11-07T00:00:00.000Z' : null,
        }] : [],
        error: null,
      };
    }
    if (call.table === 'clips' && call.action === 'select') {
      return { data: clipProjectId ? [{ project_id: clipProjectId }] : [], error: null };
    }
    if (call.table === 'projects' && call.action === 'select') {
      return { data: [{ id: PROJECT, user_id: projectOwner }], error: null };
    }
    return { data: [], error: null };
  };
}

function mockFetch(responses) {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected fetch call');
    return next;
  };
  return calls;
}

function metaResponse(filePath = 'videos/file_1.mp4') {
  return new Response(JSON.stringify({
    ok: true,
    result: { file_path: filePath, file_size: 11 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function mediaResponse() {
  return new Response(Buffer.from('media-bytes'), {
    status: 200,
    headers: { 'content-type': 'video/mp4' },
  });
}

async function withApp(options, fn) {
  const { app, fake } = await buildApp({ supabaseHandler: mediaHandler(options) });
  try {
    await fn(app, fake);
  } finally {
    await app.close();
  }
}

function mediaUrl() {
  return `/v1/media/telegram/${FILE_ID}`;
}

test('Telegram media proxy rejects missing authentication for private media', async () => {
  const calls = mockFetch([]);
  await withApp({ clipProjectId: PROJECT }, async (app) => {
    const response = await app.inject({ method: 'GET', url: mediaUrl() });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(calls, []);
  });
});

test('Telegram media proxy rejects an authenticated user who does not own the project', async () => {
  const calls = mockFetch([]);
  await withApp({ clipProjectId: PROJECT, projectOwner: OWNER }, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: mediaUrl(),
      headers: { authorization: `Bearer ${signFor(app, OTHER)}` },
    });
    assert.equal(response.statusCode, 403);
    assert.deepEqual(calls, []);
  });
});

test('Telegram media proxy rejects caller-supplied bot_token without reflecting it', async () => {
  const calls = mockFetch([]);
  await withApp({ clipProjectId: PROJECT }, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: `${mediaUrl()}?bot_token=attacker-token`,
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.includes('attacker-token'), false);
    assert.deepEqual(calls, []);
  });
});

test('Telegram media proxy rejects unsafe Telegram file paths before a second request', async () => {
  const calls = mockFetch([metaResponse('../secret')]);
  await withApp({ clipProjectId: PROJECT }, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: mediaUrl(),
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 502);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.redirect, 'error');
  });
});

test('Telegram media proxy does not follow upstream redirects', async () => {
  const calls = mockFetch([
    new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } }),
  ]);
  await withApp({ clipProjectId: PROJECT }, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: mediaUrl(),
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 502);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.redirect, 'error');
  });
});

test('Telegram media proxy serves private media only to the owning authenticated user', async () => {
  const calls = mockFetch([metaResponse(), mediaResponse()]);
  await withApp({ clipProjectId: PROJECT, projectOwner: OWNER }, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: mediaUrl(),
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body, 'media-bytes');
    assert.equal(response.headers['content-type'], 'video/mp4');
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.body.includes(BOT_TOKEN), false);
    assert.equal(JSON.stringify(response.headers).includes(BOT_TOKEN), false);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls[1].options.redirect, 'error');
    assert.equal(new URL(calls[0].url).hostname, 'api.telegram.org');
    assert.equal(new URL(calls[1].url).hostname, 'api.telegram.org');
  });
});

test('Telegram media proxy serves published master media without authentication', async () => {
  const calls = mockFetch([metaResponse(), mediaResponse()]);
  await withApp({ episodeProjectId: PROJECT, published: true }, async (app) => {
    const response = await app.inject({ method: 'GET', url: mediaUrl() });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body, 'media-bytes');
    assert.equal(calls.length, 2);
  });
});

test('Telegram media proxy returns 404 for an unknown asset and 503 when storage is unconfigured', async () => {
  let calls = mockFetch([]);
  await withApp({}, async (app) => {
    const missing = await app.inject({
      method: 'GET',
      url: mediaUrl(),
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(calls, []);
  });

  calls = mockFetch([]);
  process.env.TELEGRAM_BOT_TOKEN = '';
  await withApp({ clipProjectId: PROJECT, projectOwner: OWNER }, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: mediaUrl(),
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.includes(BOT_TOKEN), false);
    assert.deepEqual(calls, []);
  });
});
