'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const { buildScopedDbRequest } = H.dist('modules/anime/internal/workflowGateway.db.js');
const { buildProviderRequest } = H.dist('modules/anime/internal/workflowGateway.llm.js');
const { verifyGatewayHeaders, clearGatewayNonceCacheForTests } = H.dist('modules/anime/internal/workflowGateway.auth.js');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'user-1';

test('database gateway injects the authenticated project filter', () => {
  const scoped = buildScopedDbRequest({ path: '/rest/v1/projects?select=id,name', method: 'GET', project_id: PROJECT_ID, user_id: USER_ID });
  assert.match(scoped.path, new RegExp(`project_id=eq\\.${PROJECT_ID}`));
});

test('database gateway rejects a mismatched project filter', () => {
  assert.throws(() => buildScopedDbRequest({ path: `/rest/v1/projects?project_id=eq.${OTHER_PROJECT_ID}`, method: 'GET', project_id: PROJECT_ID, user_id: USER_ID }), /does not match/);
});

test('database gateway rejects disallowed tables and methods', () => {
  assert.throws(() => buildScopedDbRequest({ path: '/rest/v1/secrets', method: 'GET', project_id: PROJECT_ID, user_id: USER_ID }), /not allowed/);
  assert.throws(() => buildScopedDbRequest({ path: '/rest/v1/projects', method: 'DELETE', project_id: PROJECT_ID, user_id: USER_ID }), /Unsupported/);
});

test('database gateway keeps global catalogs read-only', () => {
  const scoped = buildScopedDbRequest({ path: '/rest/v1/voice_catalog?is_active=eq.true', method: 'GET', project_id: PROJECT_ID, user_id: USER_ID });
  assert.equal(scoped.table, 'voice_catalog');
  assert.throws(() => buildScopedDbRequest({ path: '/rest/v1/voice_catalog', method: 'POST', body: {}, project_id: PROJECT_ID, user_id: USER_ID }), /read-only/);
});

test('database gateway injects project and audit user into writes', () => {
  const scoped = buildScopedDbRequest({ path: '/rest/v1/audit_log', method: 'POST', body: { action: 'X' }, project_id: PROJECT_ID, user_id: USER_ID });
  assert.equal(scoped.body.project_id, PROJECT_ID);
  assert.equal(scoped.body.user_id, USER_ID);
  assert.throws(() => buildScopedDbRequest({ path: '/rest/v1/projects', method: 'PATCH', body: { project_id: OTHER_PROJECT_ID }, project_id: PROJECT_ID, user_id: USER_ID }), /does not match/);
});

test('database gateway separates system and project scopes', () => {
  const projectScoped = buildScopedDbRequest({ path: '/rest/v1/episode_states?current_state=eq.FAILED', method: 'GET', project_id: PROJECT_ID, user_id: USER_ID });
  assert.equal(projectScoped.table, 'episode_states');
  const systemScoped = buildScopedDbRequest({ path: '/rest/v1/episode_states?current_state=eq.FAILED', method: 'GET', project_id: PROJECT_ID, user_id: USER_ID, system: true });
  assert.equal(systemScoped.table, 'episode_states');
  assert.throws(() => buildScopedDbRequest({ path: '/rest/v1/projects', method: 'GET', project_id: PROJECT_ID, user_id: USER_ID, system: true }), /System workflows/);
});

test('provider gateway injects backend keys and rejects unsafe paths', () => {
  const groq = buildProviderRequest({ provider: 'groq', path: '/openai/v1/chat/completions', body: { model: 'x' }, env: { GROQ_API_KEY: 'g-key' } });
  assert.equal(groq.headers.Authorization, 'Bearer g-key');
  assert.match(groq.url, /^https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions/);
  const gemini = buildProviderRequest({ provider: 'gemini', path: '/v1beta/models/gemini-2.0-flash:generateContent', body: { contents: [] }, env: { GEMINI_API_KEY: 'gem-key' } });
  assert.match(gemini.url, /key=gem-key/);
  assert.throws(() => buildProviderRequest({ provider: 'groq', path: '/openai/v1/../../secrets', body: {}, env: { GROQ_API_KEY: 'g' } }), /not allowed/);
  assert.throws(() => buildProviderRequest({ provider: 'unknown', path: '/v1/x', body: {}, env: {} }), /Unsupported/);
});

test('provider gateway fails closed without a configured key', () => {
  assert.throws(() => buildProviderRequest({ provider: 'groq', path: '/openai/v1/chat/completions', body: {}, env: {} }), /not configured/);
});

test('gateway auth rejects wrong, expired, and replayed requests', () => {
  clearGatewayNonceCacheForTests();
  const now = 1_700_000_000_000;
  assert.throws(() => verifyGatewayHeaders({ token: 'bad', expectedToken: 'good', timestamp: String(now), nonce: 'n1', nowMs: now }), /Invalid/);
  assert.throws(() => verifyGatewayHeaders({ token: 'good', expectedToken: 'good', timestamp: String(now - 400_000), nonce: 'n2', nowMs: now }), /outside/);
  verifyGatewayHeaders({ token: 'good', expectedToken: 'good', timestamp: String(now), nonce: 'n3', nowMs: now });
  assert.throws(() => verifyGatewayHeaders({ token: 'good', expectedToken: 'good', timestamp: String(now), nonce: 'n3', nowMs: now }), /replay/);
});
