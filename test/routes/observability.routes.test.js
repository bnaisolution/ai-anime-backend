'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

function handler(call) {
  if (call.table === 'projects') return { data: [{ id: 'p1' }], error: null };
  return { data: null, error: null };
}

async function buildApp() {
  installFakeSupabase(handler);
  const Fastify = require('fastify');
  const app = Fastify({ logger: false });
  const { registerAnimeObservabilityRoutes } = H.dist('modules/anime/observability/observability.routes.js');
  const { resetMetricsForTests } = H.dist('modules/anime/observability/metrics.js');
  resetMetricsForTests();
  await app.register(registerAnimeObservabilityRoutes);
  await app.ready();
  return app;
}

test('live and ready endpoints report dependency health', async () => {
  const app = await buildApp();
  const live = await app.inject({ method: 'GET', url: '/v1/anime/live' });
  assert.equal(live.statusCode, 200);
  assert.equal(live.json().status, 'live');
  const ready = await app.inject({ method: 'GET', url: '/v1/anime/ready' });
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.json().dependencies.database, 'up');
  await app.close();
});

test('metrics endpoint is disabled by default and gated by a token when enabled', async () => {
  delete process.env.ANIME_METRICS_ENABLED;
  delete process.env.ANIME_METRICS_TOKEN;
  const app = await buildApp();
  const disabled = await app.inject({ method: 'GET', url: '/v1/anime/metrics' });
  assert.equal(disabled.statusCode, 404);
  await app.close();

  process.env.ANIME_METRICS_ENABLED = 'true';
  delete process.env.ANIME_METRICS_TOKEN;
  const appNoToken = await buildApp();
  const noToken = await appNoToken.inject({ method: 'GET', url: '/v1/anime/metrics' });
  assert.equal(noToken.statusCode, 503);
  await appNoToken.close();

  process.env.ANIME_METRICS_TOKEN = 'metrics-test-token';
  const app2 = await buildApp();
  const unauthorized = await app2.inject({ method: 'GET', url: '/v1/anime/metrics' });
  assert.equal(unauthorized.statusCode, 401);
  const authorized = await app2.inject({ method: 'GET', url: '/v1/anime/metrics', headers: { 'x-anime-metrics-token': 'metrics-test-token' } });
  assert.equal(authorized.statusCode, 200);
  assert.match(authorized.body, /anime_http_requests_total/);
  assert.match(authorized.body, /anime_process_uptime_seconds/);
  await app2.close();
  delete process.env.ANIME_METRICS_ENABLED;
  delete process.env.ANIME_METRICS_TOKEN;
});
