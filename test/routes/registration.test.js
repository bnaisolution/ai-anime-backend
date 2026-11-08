'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const { buildApp } = require('../helpers/app');
const { LORE_ROUTES, REGISTERED_ELSEWHERE } = require('../helpers/expected-routes');

function has(app, route) {
  return app.hasRoute({ method: route.method, url: route.path });
}

test('actual anime module registration exposes every registered-elsewhere route', async () => {
  const { app } = await buildApp({ includeLore: false });
  const missing = REGISTERED_ELSEWHERE.filter((route) => !has(app, route));
  assert.deepEqual(missing.map((r) => `${r.method} ${r.path}`), []);
  await app.close();
});

test('Lore router defines all 28 expected method+path routes exactly once', async () => {
  const { app } = await buildApp({ includeLore: true });
  const missing = LORE_ROUTES.filter((route) => !has(app, route));
  assert.deepEqual(missing.map((r) => `${r.method} ${r.path}`), []);
  const { LORE_ROUTES: _ignored } = require('../helpers/expected-routes');
  const keys = LORE_ROUTES.map((r) => `${r.method} ${r.path}`);
  assert.equal(new Set(keys).size, keys.length, 'expected route list must not contain duplicates');
  await app.close();
});

test('GET project detail is served by the registered reads router', async () => {
  const { app } = await buildApp({ includeLore: false });
  assert.equal(has(app, { method: 'GET', path: '/v1/anime/projects/:id' }), true);
  await app.close();
});
