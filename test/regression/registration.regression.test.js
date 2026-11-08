'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const { buildApp } = require('../helpers/app');
const { LORE_ROUTES } = require('../helpers/expected-routes');

function has(app, method, path) {
  return app.hasRoute({ method, url: path });
}

test('REGRESSION: actual anime module registration must expose all 28 Lore routes', async () => {
  const { app } = await buildApp({ includeLore: false });
  const missing = LORE_ROUTES.filter((route) => !has(app, route.method, route.path));
  await app.close();
  assert.deepEqual(
    missing.map((route) => `${route.method} ${route.path}`),
    [],
    'Lore routes are defined in lore.routes.ts but not registered by the actual anime module'
  );
});

test('REGRESSION: project creation route must be registered in the actual anime module', async () => {
  const { app } = await buildApp({ includeLore: false });
  const registered = has(app, 'POST', '/v1/anime/projects');
  await app.close();
  assert.equal(registered, true, 'POST /v1/anime/projects must be registered exactly once');
});
