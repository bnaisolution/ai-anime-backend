'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_SUPABASE_URL || '';
const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || '';
const enabled = process.env.ALLOW_TEST_DB === '1';

const skipReason = !enabled
  ? 'BLOCKED: set ALLOW_TEST_DB=1 plus TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_ROLE_KEY for an isolated test project'
  : !url || !key
    ? 'BLOCKED: TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_ROLE_KEY are required'
    : /prod|production/i.test(url)
      ? 'BLOCKED: production-like database URLs are refused'
      : false;

function client() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false } });
}

test('DATABASE: live projects table has the verified columns', { skip: skipReason }, async () => {
  const db = client();
  const { data, error } = await db
    .from('projects')
    .select('id,user_id,visual_medium,active_system_prompt_id')
    .limit(1);
  assert.equal(error, null);
  assert.ok(Array.isArray(data));
});

test('DATABASE: api_commands does not have error_message or updated_at', { skip: skipReason }, async () => {
  const db = client();
  const { error } = await db.from('api_commands').select('id,error_message,updated_at').limit(1);
  assert.ok(error, 'PostgREST must reject columns that do not exist');
  assert.equal(error.code, '42703');
});

test('DATABASE: scenes does not have voice_text', { skip: skipReason }, async () => {
  const db = client();
  const { error } = await db.from('scenes').select('id,voice_text').limit(1);
  assert.ok(error);
  assert.equal(error.code, '42703');
});

test('DATABASE: quota_usage exposes accumulated_units only', { skip: skipReason }, async () => {
  const db = client();
  const { error } = await db.from('quota_usage').select('accumulated_units,tokens_used').limit(1);
  assert.ok(error);
  assert.equal(error.code, '42703');
});
