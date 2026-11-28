'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const workerRoot = path.resolve(root, '../anime-cpu-worker');
const androidRoot = path.resolve(root, '../ai-anime-android');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function readWorker(relative) { return fs.readFileSync(path.join(workerRoot, relative), 'utf8'); }
function readAndroid(relative) { return fs.readFileSync(path.join(androidRoot, relative), 'utf8'); }

test('P1 migration adds visual continuity and artifact manifest fields', () => {
  for (const migration of [
    'supabase/migrations/024_visual_continuity.sql',
    'supabase/migrations/024_visual_continuity_rollback.sql',
  ]) {
    assert.ok(fs.existsSync(path.join(root, migration)), `${migration} must exist`);
  }
  const sql = read('supabase/migrations/024_visual_continuity.sql');
  for (const field of ['shot_manifest', 'camera_json', 'continuity_json', 'keyframe_url', 'scene_state_json', 'artifact_manifest']) {
    assert.match(sql, new RegExp(field));
  }
});

test('command dispatch retrieves narrative memory behind the flag', () => {
  const service = read('src/modules/anime/commands/commands.service.ts');
  assert.match(service, /retrieveContext\(/);
  assert.match(service, /animeFlags\.narrativeMemory/);
  assert.match(service, /narrative_memory: narrativeMemory/);
});

test('CPU worker accepts optional shot fields and emits an artifact manifest', () => {
  const worker = readWorker('main.py');
  for (const field of ['shot_id', 'shot_order', 'shot_type', 'camera_json', 'continuity_json', 'keyframe_url', 'parent_scene_order', 'camera_idx', 'transition_in', 'transition_out', 'first_frame_url', 'last_frame_url', 'scene_state_json']) {
    assert.match(worker, new RegExp(field));
  }
  assert.match(worker, /key=lambda x: \(x\.scene_order, x\.shot_order/);
  assert.match(worker, /artifact_manifest/);
  assert.match(worker, /shots_rendered/);
});

test('Android scene model and inspector tolerate optional shot fields', () => {
  const api = readAndroid('app/src/main/java/org/dpdns/bnai/anime/core/network/AnimeApiService.kt');
  assert.match(api, /shot_manifest: List<JsonMap>\?/);
  assert.match(api, /camera_json: JsonMap\?/);
  assert.match(api, /keyframe_url: String\?/);
  assert.match(api, /artifact_manifest: JsonMap\?/);
  const screen = readAndroid('app/src/main/java/org/dpdns/bnai/anime/ui/production/SceneDetailScreen.kt');
  assert.match(screen, /shot_manifest\?\.size/);
  assert.match(screen, /camera_json\?\.get\("movement"\)/);
  assert.match(screen, /keyframe_url/);
});

test('P2 observability counters are emitted for blocked commands and gateway failures', () => {
  assert.match(read('src/modules/anime/supervisor/supervisor.service.ts'), /anime_command_blocked_total/);
  assert.match(read('src/modules/anime/internal/workflowGateway.routes.ts'), /anime_llm_gateway_failures_total/);
});
