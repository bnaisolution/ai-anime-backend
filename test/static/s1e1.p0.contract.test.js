'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function workflow(name) { return JSON.parse(read(`n8n-workflows/${name}`)); }
function node(workflowJson, name) { return workflowJson.nodes.find((item) => item.name === name); }

test('WF-02 requires the runtime contract and fails closed on strict gates', () => {
  const wf = workflow('storywf02.json');
  const normalize = node(wf, 'Normalize Input & Lock SAVE Mode');
  const validator = node(wf, 'Output Validator, Rule 37 & JSON Sanitizer');
  assert.match(normalize.parameters.jsCode, /RUNTIME_CONTRACT_MISSING/);
  assert.match(normalize.parameters.jsCode, /EPISODE_DURATION_MISSING/);
  assert.doesNotMatch(normalize.parameters.jsCode, /episode_duration_min \|\| 24/);
  assert.match(validator.parameters.jsCode, /S1E1_STRICT_GATE_FAILED/);
  assert.match(validator.parameters.jsCode, /STAGE2_SCENE_ROUTER_FAILED/);
  assert.doesNotMatch(validator.parameters.jsCode, /rawScenes = \(stage1\.beats/);
  assert.match(validator.parameters.jsCode, /beat_count: __beatCount/);
  assert.match(validator.parameters.jsCode, /updated_at: new Date\(\)\.toISOString\(\)/);
});

test('WF-02 emits terminal scene-plan callbacks', () => {
  const wf = workflow('storywf02.json');
  const success = node(wf, 'Backend: Success Callback');
  const error = node(wf, 'Backend: Error Callback');
  assert.equal(success.executeOnce, true);
  assert.equal(error.executeOnce, true);
  assert.match(success.parameters.jsonBody, /completion_scope: "SCENE_PLAN_ONLY"/);
  assert.match(success.parameters.jsonBody, /terminal: true/);
  assert.match(error.parameters.jsonBody, /completion_scope: "SCENE_PLAN_ONLY"/);
});

test('WF-03 fetches once and emits one terminal episode callback', () => {
  const wf = workflow('storywf03.json');
  for (const name of [
    'Normalize Input & Enforce SAVE Mode',
    'Supabase: Worker Health & Session Gate',
    'Supabase: Fetch Episode Scenes',
    'Supabase: Fetch Clips & Checkpoints',
    'Supabase: Fetch Characters & DNA',
    'Supabase: Fetch Scene Library Cache',
    'Supabase: Fetch Motion Library Cache',
    'Supabase: Fetch BGM Library',
    'Supabase: Fetch SFX Library',
    'Cache Evaluator & Stage Resolver',
  ]) {
    assert.equal(node(wf, name).executeOnce, true, `${name} must execute once`);
  }
  const cache = node(wf, 'Cache Evaluator & Stage Resolver');
  assert.match(cache.parameters.jsCode, /\$\(nodeName\)\.first\(\)\.json/);
  assert.doesNotMatch(cache.parameters.jsCode, /\$\(nodeName\)\.all\(\)/);
  assert.match(cache.parameters.jsCode, /SCENE_MANIFEST_MISSING/);
  assert.doesNotMatch(cache.parameters.jsCode, /LOC_001_DEFAULT/);
  assert.ok(node(wf, 'Split In Batches (One Scene)'));
  const split = node(wf, 'Split In Batches (One Scene)');
  assert.equal(split.parameters.batchSize, 1);
  for (const name of ['Backend: Success Callback', 'Backend: Error Callback']) {
    const callback = node(wf, name);
    assert.equal(callback.executeOnce, true);
    assert.match(callback.parameters.jsonBody, /completion_scope: "EPISODE"/);
    assert.match(callback.parameters.jsonBody, /terminal: true/);
  }
});

test('backend blocks production success without media and bounds LLM batch dispatch', () => {
  const supervisor = read('src/modules/anime/supervisor/supervisor.service.ts');
  assert.match(supervisor, /COMMAND_SUCCESS_BLOCKED_NO_MEDIA/);
  assert.match(supervisor, /OUTPUT_MEDIA_MISSING/);
  assert.match(supervisor, /SCENE_PLAN_ONLY/);
  const gateway = read('src/modules/anime/internal/workflowGateway.routes.ts');
  assert.match(gateway, /batch_mode/);
  assert.match(gateway, /mapWithConcurrency/);
  assert.match(gateway, /QUOTA_DEFERRED/);
  assert.match(gateway, /response\.status === 413/);
  assert.match(gateway, /finish_reason/);
});

test('WF-02 Stage-1 uses act-wise batching with explicit output budget', () => {
  const wf = workflow('storywf02.json');
  const context = node(wf, 'Context Assembly & Prompt Constructor');
  const stage1a = node(wf, 'Stage 1A: Groq Outline & Script Writer');
  const stage1b = node(wf, 'Stage 1B: Gemini Fallback Script Writer');
  assert.match(context.parameters.jsCode, /batch_mode: 'acts'/);
  assert.match(context.parameters.jsCode, /max_tokens: 4096/);
  assert.match(context.parameters.jsCode, /stage1Batch/);
  assert.match(context.parameters.jsCode, /stage1FallbackBatch/);
  assert.match(context.parameters.jsCode, /__beatsPerActLow/);
  assert.match(context.parameters.jsCode, /__wordsPerActLow/);
  assert.equal(stage1a.parameters.options.timeout, 600000);
  assert.equal(stage1b.parameters.options.timeout, 600000);
});

test('P0 migration and rollback exist', () => {
  for (const migration of [
    'supabase/migrations/023_s1e1_integrity.sql',
    'supabase/migrations/023_s1e1_integrity_rollback.sql',
  ]) {
    assert.ok(fs.existsSync(path.join(root, migration)), `${migration} must exist`);
  }
  assert.match(read('supabase/migrations/023_s1e1_integrity.sql'), /beat_count/);
  assert.match(read('supabase/migrations/023_s1e1_integrity.sql'), /target_duration_sec/);
});
