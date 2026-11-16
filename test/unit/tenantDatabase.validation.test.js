'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const {
  validateTenantDsn,
  tenantDsnFingerprint,
  sslOptionsForMode,
} = H.dist('modules/anime/tenant/tenantDatabase.validation.js');

test('accepts a Supabase pooler DSN and defaults SSL to require', () => {
  const validated = validateTenantDsn(
    'postgresql://postgres.abcdefgh:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres'
  );
  assert.equal(validated.host, 'aws-0-eu-central-1.pooler.supabase.com');
  assert.equal(validated.port, 6543);
  assert.equal(validated.database, 'postgres');
  assert.equal(validated.username, 'postgres.abcdefgh');
  assert.equal(validated.sslmode, 'require');
  assert.equal(validated.provider, 'supabase');
  assert.match(validated.dsn, /sslmode=require/);
});

test('accepts direct Postgres DSN and preserves verified SSL modes', () => {
  const validated = validateTenantDsn(
    'postgres://anime:strong-password@db.example.com:5432/anime_data?sslmode=verify-full'
  );
  assert.equal(validated.provider, 'postgres');
  assert.equal(validated.sslmode, 'verify-full');
  assert.deepEqual(sslOptionsForMode(validated.sslmode), { rejectUnauthorized: true });
  assert.deepEqual(sslOptionsForMode('require'), { rejectUnauthorized: false });
  assert.equal(sslOptionsForMode('disable'), false);
});

test('rejects non-Postgres, unauthenticated, and malformed DSNs', () => {
  assert.throws(() => validateTenantDsn('mysql://u:p@db.example.com/anime'), /Only postgres/);
  assert.throws(() => validateTenantDsn('postgres://db.example.com/anime'), /username/);
  assert.throws(() => validateTenantDsn('postgres://u@db.example.com/anime'), /password/);
  assert.throws(() => validateTenantDsn('postgres://u:p@db.example.com/'), /Database name/);
  assert.throws(() => validateTenantDsn('postgres://u:p@db.example.com/anime?sslmode=wat'), /ssl/);
});

test('rejects local and private database hosts', () => {
  for (const host of ['localhost', 'db.local', '10.0.0.5', '127.0.0.1', '192.168.1.2', '172.20.0.1', '[::1]', '[fd00::1]']) {
    assert.throws(
      () => validateTenantDsn(`postgres://u:p@${host}:5432/anime`),
      /Private|local/,
      `expected ${host} to be rejected`
    );
  }
});

test('fingerprints are stable across password rotation but change with target', () => {
  const first = validateTenantDsn('postgres://anime:one@db.example.com:5432/anime?sslmode=require');
  const second = validateTenantDsn('postgres://anime:two@db.example.com:5432/anime?sslmode=require');
  const other = validateTenantDsn('postgres://anime:one@db.example.com:5432/other?sslmode=require');
  assert.equal(tenantDsnFingerprint(first), tenantDsnFingerprint(second));
  assert.notEqual(tenantDsnFingerprint(first), tenantDsnFingerprint(other));
});
