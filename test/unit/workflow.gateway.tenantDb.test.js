'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const { buildScopedDbRequest } = H.dist('modules/anime/internal/workflowGateway.db.js');
const {
  buildTenantDbStatement,
  executeTenantDbRequest,
  mergeTenantRows,
  setTenantDbClientFactoryForTests,
} = H.dist('modules/anime/internal/workflowGateway.tenantDb.js');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'user-1';
const DSN = 'postgresql://tester:secret@db.example.com:5432/anime?sslmode=require';

function scoped(path, extra = {}) {
  return buildScopedDbRequest({
    path,
    method: 'GET',
    project_id: PROJECT_ID,
    user_id: USER_ID,
    ...extra,
  });
}

test('tenant gateway compiles scoped reads with filters, order, and limits', () => {
  const request = scoped('/rest/v1/characters?select=character_code,name&project_id=eq.' + PROJECT_ID + '&order=name.asc&limit=10');
  const statement = buildTenantDbStatement(request);
  assert.match(statement.text, /^select "character_code", "name" from "anime_data"\."characters"/);
  assert.match(statement.text, /"project_id" = \$1/);
  assert.match(statement.text, /order by "name" asc limit 10$/);
  assert.deepEqual(statement.values, [PROJECT_ID]);
});

test('tenant gateway compiles project reads by primary key', () => {
  const request = scoped('/rest/v1/projects?select=id,name&id=eq.' + PROJECT_ID);
  const statement = buildTenantDbStatement(request);
  assert.match(statement.text, /from "anime_data"\."projects"/);
  assert.match(statement.text, /"id" = \$1/);
  assert.deepEqual(statement.values, [PROJECT_ID]);
});

test('tenant gateway compiles safe upserts and scoped patches', () => {
  const upsert = scoped('/rest/v1/episode_states?on_conflict=project_id,episode_no', {
    method: 'POST',
    body: { project_id: PROJECT_ID, episode_no: 1, current_state: 'GENERATING' },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
  const insert = buildTenantDbStatement(upsert);
  assert.match(insert.text, /^insert into "anime_data"\."episode_states"/);
  assert.match(insert.text, /on conflict \("project_id", "episode_no"\) do update set/);
  assert.match(insert.text, /"current_state" = excluded\."current_state"/);

  const patch = scoped('/rest/v1/episode_states?project_id=eq.' + PROJECT_ID + '&episode_no=eq.1', {
    method: 'PATCH',
    body: { current_state: 'PUBLISHED' },
    prefer: 'return=minimal',
  });
  const update = buildTenantDbStatement(patch);
  assert.match(update.text, /^update "anime_data"\."episode_states" set "current_state" = \$1/);
  assert.match(update.text, /where "project_id" = \$3 and "episode_no" = \$4 returning \*$/);
  assert.deepEqual(update.values, ['PUBLISHED', PROJECT_ID, PROJECT_ID, '1']);
});

test('tenant gateway compiles system retry OR filters', () => {
  const request = buildScopedDbRequest({
    path: '/rest/v1/pending_actions?select=id,status,ready_at&or=(status.eq.FAILED,and(status.eq.RETRY_SCHEDULED,ready_at.lte.2026-11-16T12:00:00Z))&order=created_at.asc&limit=25',
    method: 'GET',
    project_id: 'system',
    user_id: 'system',
    system: true,
  });
  const statement = buildTenantDbStatement(request);
  assert.match(statement.text, /\("status" = \$1 or \("status" = \$2 and "ready_at" <= \$3\)\)/);
  assert.match(statement.text, /order by "created_at" asc limit 25$/);
  assert.deepEqual(statement.values, ['FAILED', 'RETRY_SCHEDULED', '2026-11-16T12:00:00Z']);
});

test('tenant gateway rejects unsafe identifiers and unbounded updates', () => {
  assert.throws(() => buildTenantDbStatement(scoped('/rest/v1/characters?select=name->secret')), /Invalid select column/);
  assert.throws(() => buildTenantDbStatement(scoped('/rest/v1/characters?order=name.asc;drop')), /Invalid order/);
  assert.throws(() => buildTenantDbStatement(scoped('/rest/v1/characters?not=(id.eq.1)')), /not filters/);
  assert.throws(() => buildTenantDbStatement({
    path: '/rest/v1/characters',
    method: 'PATCH',
    body: { name: 'x' },
    table: 'characters',
  }), /Unbounded/);
});

test('tenant gateway merges system fan-out rows by order and limit', () => {
  const rows = [
    { id: 'b', created_at: '2026-11-16T02:00:00Z' },
    { id: 'a', created_at: '2026-11-16T01:00:00Z' },
    { id: 'c', created_at: '2026-11-16T03:00:00Z' },
  ];
  const merged = mergeTenantRows(rows, '/rest/v1/pending_actions?order=created_at.asc&limit=2');
  assert.deepEqual(merged.map((row) => row.id), ['a', 'b']);
});

test('tenant gateway executes parameterized SQL through the client factory', async () => {
  const calls = [];
  const client = {
    async connect() {},
    async query(text, values) {
      calls.push({ text, values });
      return { rows: [{ id: 'row-1' }], rowCount: 1 };
    },
    async end() {},
  };
  setTenantDbClientFactoryForTests((dsn) => {
    assert.equal(dsn, DSN);
    return client;
  });
  try {
    const request = scoped('/rest/v1/projects?select=id');
    const result = await executeTenantDbRequest(request, DSN);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, [{ id: 'row-1' }]);
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /^select "id" from "anime_data"\."projects"/);
    assert.deepEqual(calls[0].values, [PROJECT_ID]);
  } finally {
    setTenantDbClientFactoryForTests(null);
  }
});

test('tenant gateway returns 204 for minimal patches and 201 for minimal inserts', async () => {
  const client = {
    async connect() {},
    async query() { return { rows: [], rowCount: 1 }; },
    async end() {},
  };
  setTenantDbClientFactoryForTests(() => client);
  try {
    const patch = scoped('/rest/v1/projects?id=eq.' + PROJECT_ID, {
      method: 'PATCH',
      body: { name: 'Renamed' },
      prefer: 'return=minimal',
    });
    const patched = await executeTenantDbRequest(patch, DSN);
    assert.equal(patched.status, 204);
    assert.equal(patched.text, '');

    const insert = scoped('/rest/v1/audit_log', {
      method: 'POST',
      body: { action: 'X' },
      prefer: 'return=minimal',
    });
    const inserted = await executeTenantDbRequest(insert, DSN);
    assert.equal(inserted.status, 201);
    assert.equal(inserted.text, '');
  } finally {
    setTenantDbClientFactoryForTests(null);
  }
});
