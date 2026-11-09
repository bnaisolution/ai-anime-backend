'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSigner } = require('fast-jwt');
const H = require('../helpers/env');

const ANON_KEY = 'stage4-test-anon-key';
const SUPABASE_JWT_SECRET = 'stage4-test-supabase-jwt-secret';
process.env.SUPABASE_ANON_KEY = ANON_KEY;
process.env.SUPABASE_JWT_SECRET = SUPABASE_JWT_SECRET;

const { buildApp, signFor } = require('../helpers/app');

const USER = '77777777-7777-4777-8777-777777777777';
const SUPABASE_ISSUER = `${process.env.SUPABASE_URL}/auth/v1`;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function supabaseToken(overrides = {}, key = SUPABASE_JWT_SECRET) {
  const signer = createSigner({ key, algorithm: 'HS256' });
  return signer({
    sub: USER,
    iss: SUPABASE_ISSUER,
    aud: 'authenticated',
    iat: nowSeconds(),
    exp: nowSeconds() + 3600,
    email: 'user@test.invalid',
    role: 'authenticated',
    workspace_id: 'workspace-1',
    ...overrides,
  });
}

function sessionBody(overrides = {}) {
  return {
    access_token: 'supabase-access-token',
    refresh_token: 'supabase-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: USER,
      email: 'owner@test.invalid',
      app_metadata: { workspace_id: 'workspace-1' },
      user_metadata: {},
    },
    ...overrides,
  };
}

async function withApp(fn) {
  const { app, fake } = await buildApp({});
  try {
    await fn(app, fake);
  } finally {
    await app.close();
  }
}

test('Supabase password login returns access and refresh tokens without database writes', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(sessionBody()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await withApp(async (app, fake) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'OWNER@TEST.INVALID', password: 'secret' },
      });
      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.equal(body.token, 'supabase-access-token');
      assert.equal(body.access_token, 'supabase-access-token');
      assert.equal(body.refresh_token, 'supabase-refresh-token');
      assert.equal(body.user_id, USER);
      assert.equal(body.role, 'owner_admin');
      assert.equal(fake.state.calls.length, 0);
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=password$/);
      assert.equal(JSON.parse(calls[0].init.body).email, 'owner@test.invalid');
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('Supabase login maps provider rejection to 401 AUTH_INVALID', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ msg: 'Invalid login credentials' }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
  try {
    await withApp(async (app) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'user@test.invalid', password: 'wrong' },
      });
      assert.equal(response.statusCode, 401);
      assert.equal(response.json().errors[0].category, 'AUTH_INVALID');
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('Supabase refresh rotates the session and logout revokes the bearer token', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('grant_type=refresh_token')) {
      return new Response(JSON.stringify(sessionBody({ access_token: 'rotated-access', refresh_token: 'rotated-refresh' })), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await withApp(async (app) => {
      const refresh = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: 'old-refresh' },
      });
      assert.equal(refresh.statusCode, 200);
      assert.equal(refresh.json().token, 'rotated-access');
      assert.equal(refresh.json().refresh_token, 'rotated-refresh');

      const logout = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${signFor(app, USER)}` },
      });
      assert.equal(logout.statusCode, 200);
      assert.equal(logout.json().status, 'completed');
      assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=refresh_token$/);
      assert.match(calls[1].url, /\/auth\/v1\/logout$/);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('Supabase HS256 JWT authenticates /me and rejects service_role tokens', async () => {
  await withApp(async (app) => {
    const accepted = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${supabaseToken()}` },
    });
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.json().user.userId, USER);
    assert.equal(accepted.json().user.workspaceId, 'workspace-1');

    const serviceRole = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${supabaseToken({ role: 'service_role' })}` },
    });
    assert.equal(serviceRole.statusCode, 401);
  });
});

test('Supabase JWT verification rejects wrong issuer, wrong audience, expiry, and signature', async () => {
  const { verifySupabaseJwt } = H.dist('modules/auth/supabase.auth.js');
  await assert.rejects(() => verifySupabaseJwt(supabaseToken({ iss: 'https://wrong.invalid/auth/v1' })), /issuer/i);
  await assert.rejects(() => verifySupabaseJwt(supabaseToken({ aud: 'wrong' })), /audience/i);
  await assert.rejects(() => verifySupabaseJwt(supabaseToken({ iat: nowSeconds() - 7200, exp: nowSeconds() - 3600 })), /expired/i);
  await assert.rejects(() => verifySupabaseJwt(supabaseToken({}, 'wrong-secret')), /signature/i);
});
