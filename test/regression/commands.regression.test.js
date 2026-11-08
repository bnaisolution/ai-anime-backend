'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const { buildApp, signFor } = require('../helpers/app');

const OWNER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';

function makeHandler() {
  return async (call) => {
    if (call.table === 'token_blacklist') return { data: null, error: null };
    if (call.table === 'api_commands' && call.action === 'select') return { data: null, error: null };
    if (call.table === 'projects' && call.action === 'select') return { data: { id: PROJECT, user_id: OWNER }, error: null };
    if (call.action === 'insert') return { data: { id: '66666666-6666-4666-8666-666666666666', ...call.payload }, error: null };
    if (call.action === 'select') return { data: [], error: null };
    return { data: null, error: null };
  };
}

test('REGRESSION: command submission must require an explicit Idempotency-Key header', async () => {
  const { app } = await buildApp({ supabaseHandler: makeHandler(), rpcHandler: () => ({ data: null, error: null }) });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/commands',
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
      payload: { intent: 'CREATE_PROJECT', project_id: PROJECT, payload: { name: 'No Key' } },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'MISSING_IDEMPOTENCY');
  } finally {
    await app.close();
  }
});
