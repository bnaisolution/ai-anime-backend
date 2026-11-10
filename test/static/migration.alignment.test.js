'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const migration = fs.readFileSync(
  path.join(H.backendRoot, 'supabase/migrations/002_batch1_schema_alignment.sql'),
  'utf8'
);
const rollback = fs.readFileSync(
  path.join(H.backendRoot, 'supabase/migrations/002_batch1_schema_alignment_rollback.sql'),
  'utf8'
);
const baselineSchema = fs.readFileSync(
  path.join(H.backendRoot, 'supabase/migrations/001_full_schema.sql'),
  'utf8'
);
const jobsSource = fs.readFileSync(
  path.join(H.backendRoot, 'src/modules/anime/reads/jobs.service.ts'),
  'utf8'
);
const overviewSource = fs.readFileSync(
  path.join(H.backendRoot, 'src/modules/anime/reads/overview.service.ts'),
  'utf8'
);
const plannerSource = fs.readFileSync(
  path.join(H.backendRoot, 'src/modules/anime/intelligence/planner.service.ts'),
  'utf8'
);


function assertBalancedParentheses(sql, label) {
  let depth = 0;
  let inSingleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i += 1; }
      continue;
    }
    if (inSingleQuote) {
      if (ch === "'" && next === "'") { i += 1; continue; }
      if (ch === "'") inSingleQuote = false;
      continue;
    }
    if (ch === '-' && next === '-') { inLineComment = true; i += 1; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i += 1; continue; }
    if (ch === "'") { inSingleQuote = true; continue; }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    assert.ok(depth >= 0, `${label}: unexpected closing parenthesis at offset ${i}`);
  }
  assert.equal(depth, 0, `${label}: unbalanced parentheses`);
}


function claimOutboxFunctionBody(sql) {
  const match = sql.match(/CREATE (?:OR REPLACE )?FUNCTION public\.claim_outbox_batch[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
  return match ? match[1].trim() : null;
}

test('Batch 1 rollback restores the exact pre-Batch-1 outbox claim function', () => {
  const baseline = claimOutboxFunctionBody(baselineSchema);
  const restored = claimOutboxFunctionBody(rollback);
  assert.ok(baseline, 'baseline function not found');
  assert.ok(restored, 'rollback function not found');
  assert.equal(restored, baseline);
});

test('Batch 1 migration and rollback SQL have balanced parentheses', () => {
  assertBalancedParentheses(migration, '002_batch1_schema_alignment.sql');
  assertBalancedParentheses(rollback, '002_batch1_schema_alignment_rollback.sql');
});

test('Batch 1 user_system_prompts policy is restricted to service_role', () => {
  assert.match(migration, /CREATE POLICY "Allow service role full access on user_system_prompts"[\s\S]*?TO service_role[\s\S]*?WITH CHECK \(true\)/);
});

test('Batch 1 migration adds the missing live-schema table and columns', () => {
  for (const fragment of [
    'CREATE TABLE IF NOT EXISTS public.user_system_prompts',
    'ADD COLUMN IF NOT EXISTS visual_medium',
    'ADD COLUMN IF NOT EXISTS active_system_prompt_id',
    'ADD COLUMN IF NOT EXISTS synopsis',
    'ADD COLUMN IF NOT EXISTS tg_image_file_id',
    'ADD COLUMN IF NOT EXISTS tg_audio_file_id',
    'ADD COLUMN IF NOT EXISTS tg_video_file_id',
    'ADD COLUMN IF NOT EXISTS clip_url',
    'ADD COLUMN IF NOT EXISTS provider',
    'ADD COLUMN IF NOT EXISTS duration_sec',
    'ADD COLUMN IF NOT EXISTS processing_started_at',
  ]) {
    assert.ok(migration.includes(fragment), `missing migration fragment: ${fragment}`);
  }
});

test('Batch 1 migration leases claimed outbox events', () => {
  assert.match(migration, /processing_started_at = now\(\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.claim_outbox_batch/);
});

test('Batch 1 rollback reverses every additive change', () => {
  for (const fragment of [
    'DROP COLUMN IF EXISTS visual_medium',
    'DROP COLUMN IF EXISTS active_system_prompt_id',
    'DROP COLUMN IF EXISTS synopsis',
    'DROP COLUMN IF EXISTS processing_started_at',
    'DROP TABLE IF EXISTS public.user_system_prompts',
    'CREATE OR REPLACE FUNCTION public.claim_outbox_batch',
  ]) {
    assert.ok(rollback.includes(fragment), `missing rollback fragment: ${fragment}`);
  }
});

test('jobs and overview never write or select api_commands columns absent from the live schema', () => {
  assert.equal(/\berror_message\b/.test(jobsSource), false);
  assert.equal(/api_commands[\s\S]{0,400}updated_at/.test(jobsSource), false);
  assert.equal(/api_commands[\s\S]{0,400}updated_at/.test(overviewSource), false);
});

test('preflight and jobs cleanup no longer mass-fail active commands by age alone', () => {
  assert.equal(/3 \* 60 \* 1000/.test(plannerSource), false);
  assert.equal(/update\(\{ status: 'FAILED' \}\)/.test(plannerSource), false);
  assert.equal(/api_commands[\s\S]{0,400}status: 'FAILED'/.test(jobsSource), false);
});

const batch2Migration = fs.readFileSync(
  path.join(H.backendRoot, 'supabase/migrations/003_batch2_prompt_library.sql'),
  'utf8'
);
const batch2Rollback = fs.readFileSync(
  path.join(H.backendRoot, 'supabase/migrations/003_batch2_prompt_library_rollback.sql'),
  'utf8'
);
const promptRoutesSource = fs.readFileSync(
  path.join(H.backendRoot, 'src/modules/anime/infrastructure/infrastructure.routes.ts'),
  'utf8'
);
const memorySource = fs.readFileSync(
  path.join(H.backendRoot, 'src/modules/anime/intelligence/memory.service.ts'),
  'utf8'
);

test('Batch 2 migration and rollback SQL have balanced parentheses', () => {
  assertBalancedParentheses(batch2Migration, '003_batch2_prompt_library.sql');
  assertBalancedParentheses(batch2Rollback, '003_batch2_prompt_library_rollback.sql');
});

test('Batch 2 migration adds the prompt library, versioning, association, and memory changes', () => {
  for (const fragment of [
    'ADD COLUMN IF NOT EXISTS prompt_category',
    'ADD COLUMN IF NOT EXISTS genre',
    'ADD COLUMN IF NOT EXISTS format',
    'ADD COLUMN IF NOT EXISTS is_favorite',
    'ADD COLUMN IF NOT EXISTS version',
    'CREATE TABLE IF NOT EXISTS public.prompt_versions',
    'CREATE TABLE IF NOT EXISTS public.project_prompt_associations',
    'ALTER TABLE public.memory_knowledge ALTER COLUMN embedding DROP NOT NULL',
    'CREATE TRIGGER user_system_prompts_snapshot_version',
  ]) {
    assert.ok(batch2Migration.includes(fragment), `missing Batch 2 migration fragment: ${fragment}`);
  }
});

test('Batch 2 rollback reverses every additive change', () => {
  for (const fragment of [
    'DROP TABLE IF EXISTS public.project_prompt_associations',
    'DROP TABLE IF EXISTS public.prompt_versions',
    'DROP COLUMN IF EXISTS prompt_category',
    'DROP COLUMN IF EXISTS is_favorite',
    'ALTER TABLE public.memory_knowledge ALTER COLUMN embedding SET NOT NULL',
  ]) {
    assert.ok(batch2Rollback.includes(fragment), `missing Batch 2 rollback fragment: ${fragment}`);
  }
});

test('prompt routes scope every read/write to the authenticated user and expose PATCH/favorite/version/filter paths', () => {
  assert.match(promptRoutesSource, /app\.patch\('\/v1\/anime\/prompts\/:id'/);
  assert.match(promptRoutesSource, /app\.post\('\/v1\/anime\/prompts\/:id\/favorite'/);
  assert.match(promptRoutesSource, /app\.get\('\/v1\/anime\/prompts\/:id\/versions'/);
  assert.match(promptRoutesSource, /app\.post\('\/v1\/anime\/prompts\/validate-compatibility'/);
  assert.match(promptRoutesSource, /\.eq\('user_id', userId\)/);
  assert.match(promptRoutesSource, /is_favorite/);
  assert.match(promptRoutesSource, /ilike/);
});

test('prompt save no longer mutates the project visual medium', () => {
  const saveBlock = promptRoutesSource.slice(
    promptRoutesSource.indexOf("app.post('/v1/anime/prompts'"),
    promptRoutesSource.indexOf("app.patch('/v1/anime/prompts/:id'")
  );
  assert.equal(/\.from\('projects'\)[\s\S]*?visual_medium/.test(saveBlock), false);
  assert.match(saveBlock, /active_system_prompt_id: data\.id/);
});

test('story memory no longer writes random embeddings', () => {
  assert.equal(memorySource.includes('Math.random'), false);
  assert.match(memorySource, /getEmbedding/);
  assert.match(memorySource, /ilike\('content'/);
});

const chatMemorySource = fs.readFileSync(
  path.join(H.backendRoot, 'src/modules/memory/memory.routes.ts'),
  'utf8'
);

test('chat memory supports scopes, dedup, correction, deletion, and reconciliation', () => {
  for (const fragment of [
    "body.scope",
    "ilike('content'",
    'deduplicated',
    "fastify.post('/correct'",
    "fastify.post('/delete'",
    "fastify.post('/reconcile'",
    'by_scope',
    'by_status',
  ]) {
    assert.ok(chatMemorySource.includes(fragment), `missing chat memory fragment: ${fragment}`);
  }
});
