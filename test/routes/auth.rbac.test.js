'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSigner } = require('fast-jwt');
require('../helpers/env');
const { buildApp, signFor } = require('../helpers/app');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const OTHER_PROJECT = '44444444-4444-4444-8444-444444444444';
const JOB = '55555555-5555-4555-8555-555555555555';

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function rawToken(overrides = {}, key = process.env.JWT_SECRET) {
  const signer = createSigner({ key, algorithm: 'HS256' });
  return signer({
    sub: OWNER,
    iss: process.env.JWT_ISSUER,
    aud: process.env.JWT_AUDIENCE,
    iat: nowSeconds(),
    exp: nowSeconds() + 3600,
    email: 'owner@test.invalid',
    role: 'normal_user',
    ...overrides,
  });
}

function makeHandler(options = {}) {
  const owner = Object.prototype.hasOwnProperty.call(options, 'owner') ? options.owner : OWNER;
  return async (call) => {
    if (call.table === 'projects' && call.action === 'select') {
      const idFilter = call.filters.find((filter) => filter.op === 'eq' && filter.col === 'id');
      const row = (!idFilter || idFilter.value === PROJECT)
        ? { id: PROJECT, user_id: owner, name: 'P', story_bible: {} }
        : null;
      if (call.mode === 'maybeSingle' || call.mode === 'single') return { data: row, error: null };
      return { data: row ? [row] : [], error: null };
    }
    if (call.action === 'insert') return { data: { id: '66666666-6666-4666-8666-666666666666', ...call.payload }, error: null };
    if (call.action === 'update') return { data: { id: PROJECT, ...call.payload }, error: null };
    if (call.action === 'select' && (call.mode === 'maybeSingle' || call.mode === 'single')) return { data: null, error: null };
    if (call.action === 'select') return { data: [], error: null };
    return { data: null, error: null };
  };
}

function commandRpc(name, args) {
  assert.equal(name, 'insert_anime_command_atomic');
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
      created_at: '2026-11-07T00:00:00.000Z',
    },
    error: null,
  };
}

async function withApp(options, fn) {
  const { app, fake } = await buildApp({
    supabaseHandler: makeHandler(options),
    rpcHandler: options.rpcHandler,
    includeLore: options.includeLore,
  });
  try {
    await fn(app, fake);
  } finally {
    await app.close();
  }
}

async function getProject(app, headers = {}) {
  return app.inject({
    method: 'GET',
    url: `/v1/anime/projects/${PROJECT}`,
    headers,
  });
}

test('protected project route rejects a missing JWT with 401', async () => {
  await withApp({}, async (app) => {
    const response = await getProject(app);
    assert.equal(response.statusCode, 401);
  });
});

test('protected project route rejects an invalid JWT signature with 401', async () => {
  await withApp({}, async (app) => {
    const response = await getProject(app, { authorization: `Bearer ${rawToken({}, 'wrong-signing-key')}` });
    assert.equal(response.statusCode, 401);
  });
});

test('protected project route rejects an expired JWT with 401', async () => {
  await withApp({}, async (app) => {
    const response = await getProject(app, {
      authorization: `Bearer ${rawToken({ iat: nowSeconds() - 7200, exp: nowSeconds() - 3600 })}`,
    });
    assert.equal(response.statusCode, 401);
  });
});

test('protected project route rejects a JWT with the wrong issuer or audience', async () => {
  await withApp({}, async (app) => {
    const wrongIssuer = await getProject(app, { authorization: `Bearer ${rawToken({ iss: 'wrong-issuer' })}` });
    assert.equal(wrongIssuer.statusCode, 401);
    const wrongAudience = await getProject(app, { authorization: `Bearer ${rawToken({ aud: 'wrong-audience' })}` });
    assert.equal(wrongAudience.statusCode, 401);
  });
});

test('a valid authenticated owner can read their project', async () => {
  await withApp({}, async (app) => {
    const response = await getProject(app, { authorization: `Bearer ${signFor(app, OWNER)}` });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.user_id, OWNER);
  });
});

test('a valid authenticated user cannot read another user\'s project', async () => {
  await withApp({ owner: OTHER }, async (app) => {
    const response = await getProject(app, { authorization: `Bearer ${signFor(app, OWNER)}` });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'PROJECT_FORBIDDEN');
  });
});

test('a null-owner project is denied and is never auto-claimed', async () => {
  await withApp({ owner: null }, async (app, fake) => {
    const response = await getProject(app, { authorization: `Bearer ${signFor(app, OWNER)}` });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'PROJECT_FORBIDDEN');
    assert.deepEqual(fake.state.calls.filter((call) => call.action === 'update'), []);
  });
});

test('x-user-id and x-project-id headers cannot override the verified JWT identity or route project', async () => {
  await withApp({}, async (app) => {
    const userSpoof = await getProject(app, {
      authorization: `Bearer ${signFor(app, OWNER)}`,
      'x-user-id': OTHER,
    });
    assert.equal(userSpoof.statusCode, 403);

    const projectSpoof = await getProject(app, {
      authorization: `Bearer ${signFor(app, OWNER)}`,
      'x-project-id': OTHER_PROJECT,
    });
    assert.equal(projectSpoof.statusCode, 403);
  });
});

test('body user_id cannot override the verified command owner', async () => {
  await withApp({ rpcHandler: commandRpc }, async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/commands',
      headers: {
        authorization: `Bearer ${signFor(app, OWNER)}`,
        'idempotency-key': `idem-spoof-${Date.now()}`,
      },
      payload: { intent: 'CREATE_PROJECT', project_id: PROJECT, user_id: OTHER, payload: { name: 'Spoof' } },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'PROJECT_FORBIDDEN');
  });
});

test('unauthorized project command execution is rejected before the command is inserted', async () => {
  await withApp({ rpcHandler: commandRpc }, async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/commands',
      headers: {
        authorization: `Bearer ${signFor(app, OTHER)}`,
        'idempotency-key': `idem-unauthorized-${Date.now()}`,
      },
      payload: { intent: 'CREATE_PROJECT', project_id: PROJECT, payload: { name: 'Denied' } },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'PROJECT_FORBIDDEN');
    assert.equal(fake.state.rpcCalls.length, 0);
  });
});

test('valid owner command execution uses the JWT subject as user_id', async () => {
  await withApp({ rpcHandler: commandRpc }, async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/anime/commands',
      headers: {
        authorization: `Bearer ${signFor(app, OWNER)}`,
        'idempotency-key': `idem-owner-${Date.now()}`,
      },
      payload: { intent: 'CREATE_PROJECT', project_id: PROJECT, payload: { name: 'Allowed' } },
    });
    assert.equal(response.statusCode, 202);
    assert.equal(fake.state.rpcCalls.length, 1);
    assert.equal(fake.state.rpcCalls[0].args.p_user_id, OWNER);
  });
});

test('unauthorized project cancellation is rejected by the project guard', async () => {
  await withApp({ includeLore: true }, async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/anime/projects/${PROJECT}/jobs/${JOB}/cancel`,
      headers: { authorization: `Bearer ${signFor(app, OTHER)}` },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'PROJECT_FORBIDDEN');
    assert.deepEqual(fake.state.calls.filter((call) => call.action === 'update'), []);
  });
});

test('fake password login is disabled and never issues a token or writes to the database', async () => {
  await withApp({}, async (app, fake) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'owner@test.invalid', password: 'anything' },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().errors[0].category, 'AUTH_NOT_CONFIGURED');
    assert.equal(response.json().token, undefined);
    assert.deepEqual(fake.state.calls, []);
  });
});

test('authenticated /me returns the verified JWT identity', async () => {
  await withApp({}, async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().user.userId, OWNER);
  });
});

test('owner_admin is granted only by the configured email allowlist, not by the subject or role claim', async () => {
  await withApp({}, async (app) => {
    const ownerSubjectOnly = await app.inject({
      method: 'GET',
      url: '/api/v1/config/prompts',
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(ownerSubjectOnly.statusCode, 403);

    const spoofedRoleClaim = await app.inject({
      method: 'GET',
      url: '/api/v1/config/prompts',
      headers: { authorization: `Bearer ${signFor(app, OWNER, { role: 'owner_admin' })}` },
    });
    assert.equal(spoofedRoleClaim.statusCode, 403);

    const allowlistedOwner = await app.inject({
      method: 'GET',
      url: '/api/v1/config/prompts',
      headers: {
        authorization: `Bearer ${signFor(app, OWNER, { email: 'owner@test.invalid' })}`,
      },
    });
    assert.equal(allowlistedOwner.statusCode, 200);
  });
});

test('a trusted_service JWT cannot authenticate as a user', async () => {
  await withApp({}, async (app) => {
    const response = await getProject(app, {
      authorization: `Bearer ${rawToken({ role: 'trusted_service' })}`,
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().errors[0].category, 'UNAUTHORIZED');
  });
});

test('infrastructure routes require a JWT and work for the authenticated user', async () => {
  await withApp({}, async (app) => {
    const unauthenticated = await app.inject({ method: 'GET', url: '/v1/anime/infrastructure' });
    assert.equal(unauthenticated.statusCode, 401);

    const authenticated = await app.inject({
      method: 'GET',
      url: '/v1/anime/infrastructure',
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(authenticated.statusCode, 200);
    assert.deepEqual(authenticated.json().data, []);

    const gpu = await app.inject({
      method: 'GET',
      url: '/v1/anime/infrastructure/gpu',
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(gpu.statusCode, 200);
    assert.equal(gpu.json().data.preferred_mode, 'KAGGLE_AUTO');
  });
});

test('project-scoped prompt routes enforce project ownership', async () => {
  await withApp({}, async (app) => {
    const unauthenticated = await app.inject({
      method: 'GET',
      url: `/v1/anime/prompts?project_id=${PROJECT}`,
    });
    assert.equal(unauthenticated.statusCode, 401);

    const ownProject = await app.inject({
      method: 'GET',
      url: `/v1/anime/prompts?project_id=${PROJECT}`,
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(ownProject.statusCode, 200);

    const crossProject = await app.inject({
      method: 'GET',
      url: `/v1/anime/prompts?project_id=${OTHER_PROJECT}`,
      headers: { authorization: `Bearer ${signFor(app, OWNER)}` },
    });
    assert.equal(crossProject.statusCode, 403);
    assert.equal(crossProject.json().error.code, 'PROJECT_FORBIDDEN');
  });
});
