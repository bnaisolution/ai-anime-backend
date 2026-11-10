'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const MIGRATIONS = path.join(H.backendRoot, 'supabase/migrations');
const DB_TEST = fs.readFileSync(path.join(H.backendRoot, 'test/db/database.integration.test.js'), 'utf8');
const CI = fs.readFileSync(path.join(H.backendRoot, '.github/workflows/backend-tests.yml'), 'utf8');

test('database integration tests require explicit opt-in and isolated credentials', () => {
  assert.match(DB_TEST, /process\.env\.ALLOW_TEST_DB === '1'/);
  assert.match(DB_TEST, /process\.env\.TEST_SUPABASE_URL/);
  assert.match(DB_TEST, /process\.env\.TEST_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(DB_TEST, /\/prod\|production\/i\.test\(url\)/);
  assert.match(DB_TEST, /production-like database URLs are refused/);
});

test('database CI gate requires RUN_DB_TESTS plus both isolated secrets', () => {
  assert.match(CI, /RUN_DB_TESTS: \$\{\{ vars\.RUN_DB_TESTS \}\}/);
  assert.match(CI, /TEST_SUPABASE_URL: \$\{\{ secrets\.TEST_SUPABASE_URL \}\}/);
  assert.match(CI, /TEST_SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.TEST_SUPABASE_SERVICE_ROLE_KEY \}\}/);
  assert.match(CI, /if \[ "\$\{RUN_DB_TESTS:-false\}" != "true" \]/);
  assert.match(CI, /ALLOW_TEST_DB: "1"/);
  assert.match(CI, /test\/db\/\*\.test\.js/);
});

test('migration files are uniquely ordered and every non-baseline migration has a rollback', () => {
  const files = fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  const prefixes = new Map();
  for (const file of files) {
    const match = file.match(/^(\d{3})_/);
    assert.ok(match, `${file}: numeric prefix`);
    const key = match[1];
    if (file.endsWith('_rollback.sql')) continue;
    assert.equal(prefixes.has(key), false, `${file}: duplicate migration prefix ${key}`);
    prefixes.set(key, file);
  }
  for (const [prefix, file] of prefixes) {
    if (file === '001_full_schema.sql') continue;
    const rollback = `${file.replace(/\.sql$/, '')}_rollback.sql`;
    assert.equal(files.includes(rollback), true, `${file}: missing ${rollback}`);
    assert.equal(prefix, rollback.match(/^(\d{3})_/)[1], `${rollback}: prefix mismatch`);
  }
  for (const file of files.filter((name) => name.endsWith('_rollback.sql'))) {
    const base = file.replace(/_rollback\.sql$/, '.sql');
    assert.equal(files.includes(base), true, `${file}: orphan rollback`);
  }
});

test('migrations contain no database-wide destructive commands', () => {
  for (const file of fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    assert.equal(/\bDROP\s+DATABASE\b/i.test(sql), false, `${file}: DROP DATABASE`);
    assert.equal(/\bALTER\s+DATABASE\b/i.test(sql), false, `${file}: ALTER DATABASE`);
    assert.equal(/\bTRUNCATE\s+(?:TABLE\s+)?(?:public\.)?[a-z_][a-z0-9_]*/i.test(sql), false, `${file}: TRUNCATE`);
  }
});
