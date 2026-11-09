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
