'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const { buildApp, signFor } = require('../helpers/app');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';

function makeHandler(options = {}) {
  const owner = options.owner ?? OWNER;
  const exists = options.exists !== false;
  return async (call) => {
    if (call.table === 'token_blacklist') return { data: null, error: null };
    if (call.table === 'projects' && call.action === 'select') {
      const idFilter = call.filters.find((filter) => filter.op === 'eq' && filter.col === 'id');
      const matchesId = !idFilter || idFilter.value === PROJECT;
      const row = exists && matchesId ? { id: PROJECT, user_id: owner, name: 'P', story_bible: { budget_ceiling: 1000 } } : null;
      if (call.mode === 'maybeSingle' || call.mode === 'single') return { data: row, error: null };
      return { data: row ? [row] : [], error: null };
    }
    if (call.table === 'quota_usage' && call.action === 'select') {
      return { data: [{ project_id: PROJECT, usage_date: '2026-11-07', accumulated_units: 42 }], error: null };
    }
    if (call.action === 'insert') {
      return { data: { id: '44444444-4444-4444-8444-444444444444', ...call.payload }, error: null };
    }
    if (call.action === 'update') {
      return { data: { id: PROJECT, ...call.payload }, error: null };
    }
    if (call.action === 'select') return { data: [], error: null };
    return { data: null, error: null };
  };
}

async function withApp(options, fn) {
  const { app, fake } = await buildApp({ includeLore: true, supabaseHandler: makeHandler(options) });
  try {
    await fn(app, fake);
  } finally {
    await app.close();
  }
}

test('Lore read route rejects an unauthenticated request', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({ method: 'GET', url: `/v1/anime/projects/${PROJECT}/quota` });
    assert.ok([401, 403].includes(response.statusCode), `expected 401/403, got ${response.statusCode}`);
  });
});

test('Lore read route rejects the all-zero project uuid', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/anime/projects/00000000-0000-0000-0000-000000000000/quota',
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'PROJECT_FORBIDDEN');
  });
});

test('Lore read route rejects cross-project access', async () => {
  await withApp({ owner: OTHER }, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/anime/projects/${PROJECT}/quota`,
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'PROJECT_FORBIDDEN');
  });
});

test('Lore quota returns a standard data envelope for the owner', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/anime/projects/${PROJECT}/quota`,
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.ok(body.data);
    assert.equal(body.data.project_id, PROJECT);
    assert.ok(Array.isArray(body.data.items));
  });
});

test('project creation stores the JWT subject and ignores a body user_id override', async () => {
  await withApp({}, async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/projects',
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
      payload: { name: 'Ownership Test', user_id: OTHER },
    });
    assert.ok([200, 201].includes(response.statusCode));
    const insert = fake.state.calls.find((call) => call.table === 'projects' && call.action === 'insert');
    assert.ok(insert, 'project insert was called');
    assert.equal(insert.payload.user_id, OWNER);
  });
});


test('episode PATCH rejects client-supplied state for editor role', async () => {
  await withApp({}, async (app, fake) => {
    for (const payload of [{ season_no: 1, status: 'PUBLISHED' }, { season_no: 1, current_state: 'PUBLISHED' }]) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/anime/projects/${PROJECT}/episodes/1`,
        headers: { authorization: `Bearer ${signFor(app, OWNER, { role: 'editor' })}` },
        payload,
      });
      assert.equal(response.statusCode, 422);
      assert.equal(response.json().error.code, 'OUTPUT_INVALID');
    }
    assert.equal(fake.state.calls.filter((call) => call.table === 'episodes' && call.action === 'update').length, 0);
  });
});

test('episode PATCH still allows metadata updates without state fields', async () => {
  await withApp({}, async (app, fake) => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/anime/projects/${PROJECT}/episodes/1`,
      headers: { authorization: `Bearer ${signFor(app, OWNER, { role: 'editor' })}` },
      payload: { season_no: 1, title: 'Updated title' },
    });
    assert.equal(response.statusCode, 200);
    const update = fake.state.calls.find((call) => call.table === 'episodes' && call.action === 'update');
    assert.ok(update);
    assert.equal(update.payload.title, 'Updated title');
    assert.equal(Object.prototype.hasOwnProperty.call(update.payload, 'current_state'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(update.payload, 'status'), false);
  });
});

test('episode list exposes approval_status for the Android publish gate', async () => {
  const handler = async (call) => {
    if (call.table === 'projects' && call.action === 'select') {
      return { data: { id: PROJECT, user_id: OWNER, name: 'P' }, error: null };
    }
    if (call.table === 'episodes' && call.action === 'select') {
      return { data: [{ id: 'ep-1', project_id: PROJECT, season_no: 1, episode_no: 1, approval_status: 'APPROVED' }], error: null };
    }
    return { data: [], error: null };
  };
  const { app } = await buildApp({ supabaseHandler: handler });
  try {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/anime/projects/${PROJECT}/episodes?seasonNo=1`,
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data[0].approval_status, 'APPROVED');
  } finally {
    await app.close();
  }
});

test('episode approval closes only the exact season/episode/media QC task', async () => {
  const mediaUrl = 'https://cdn/master.mp4';
  const handler = async (call) => {
    if (call.table === 'projects' && call.action === 'select') {
      return { data: { id: PROJECT, user_id: OWNER, name: 'P' }, error: null };
    }
    if (call.table === 'episodes' && call.action === 'select') {
      return { data: { episode_no: 2, season_no: 3, qc_status: 'PASSED', output_media: { final_video_url: mediaUrl } }, error: null };
    }
    if (call.table === 'episodes' && call.action === 'update') {
      return { data: { id: 'ep-2', season_no: 3, episode_no: 2, ...call.payload }, error: null };
    }
    if (call.table === 'pending_actions' && call.action === 'select') {
      return {
        data: [
          { id: 'task-other-season', action_payload: { season_no: 2, episode_no: 2, media_url: mediaUrl } },
          { id: 'task-other-media', action_payload: { season_no: 3, episode_no: 2, media_url: 'https://cdn/other.mp4' } },
          { id: 'task-match', action_payload: { season_no: 3, episode_no: 2, media_url: mediaUrl } },
        ],
        error: null,
      };
    }
    if (call.table === 'pending_actions' && call.action === 'update') {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };
  const { app, fake } = await buildApp({ supabaseHandler: handler });
  try {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/anime/projects/${PROJECT}/episodes/2/approval`,
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
      payload: { season_no: 3, decision: 'APPROVED' },
    });
    assert.equal(response.statusCode, 200);
    const taskUpdates = fake.state.calls.filter((call) => call.table === 'pending_actions' && call.action === 'update');
    assert.equal(taskUpdates.length, 1);
    assert.ok(taskUpdates[0].filters.some((filter) => filter.op === 'eq' && filter.col === 'id' && filter.value === 'task-match'));
  } finally {
    await app.close();
  }
});

test('episode approval does not close QC tasks when the master media URL is missing', async () => {
  const handler = async (call) => {
    if (call.table === 'projects' && call.action === 'select') {
      return { data: { id: PROJECT, user_id: OWNER, name: 'P' }, error: null };
    }
    if (call.table === 'episodes' && call.action === 'select') {
      return { data: { episode_no: 2, season_no: 3, qc_status: 'PASSED', output_media: {} }, error: null };
    }
    if (call.table === 'episodes' && call.action === 'update') {
      return { data: { id: 'ep-2', season_no: 3, episode_no: 2, ...call.payload }, error: null };
    }
    if (call.table === 'pending_actions' && call.action === 'select') {
      return { data: [{ id: 'task-any', action_payload: { season_no: 3, episode_no: 2 } }], error: null };
    }
    if (call.table === 'pending_actions' && call.action === 'update') {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };
  const { app, fake } = await buildApp({ supabaseHandler: handler });
  try {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/anime/projects/${PROJECT}/episodes/2/approval`,
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
      payload: { season_no: 3, decision: 'APPROVED' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(fake.state.calls.filter((call) => call.table === 'pending_actions' && call.action === 'update').length, 0);
  } finally {
    await app.close();
  }
});
