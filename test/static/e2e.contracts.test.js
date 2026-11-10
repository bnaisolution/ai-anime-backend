'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const WORKFLOW_DIR = path.join(H.backendRoot, 'n8n-workflows');
const ANDROID_ROOT = path.join(H.repoRoot, 'ai-anime-android');
const WORKER_ROOT = path.join(H.repoRoot, 'anime-cpu-worker');
const BACKEND_SRC = path.join(H.backendRoot, 'src');
const ANDROID_API = path.join(ANDROID_ROOT, 'app/src/main/java/org/dpdns/bnai/anime/core/network/AnimeApiService.kt');
const WORKER_MAIN = path.join(WORKER_ROOT, 'main.py');

function readTree(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...readTree(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function workflowSources() {
  return fs.readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({
      name,
      raw: fs.readFileSync(path.join(WORKFLOW_DIR, name), 'utf8'),
      json: JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, name), 'utf8')),
    }));
}

function classBody(source, className) {
  const start = source.indexOf(`class ${className}`);
  if (start === -1) return '';
  const rest = source.slice(start);
  const end = rest.search(/\nclass |\n@app|\ndef /);
  return end === -1 ? rest : rest.slice(0, end);
}

test('canonical workflows only call worker endpoints declared by the worker', () => {
  const workflows = workflowSources();
  const referenced = new Set();
  for (const workflow of workflows) {
    for (const match of workflow.raw.matchAll(/\/v1\/(?:tts|ffmpeg)\/[a-z0-9-]+/g)) {
      referenced.add(match[0]);
    }
  }
  assert.deepEqual([...referenced].sort(), [
    '/v1/ffmpeg/render-episode',
    '/v1/tts/supertonic',
    '/v1/tts/svara',
  ]);
  const worker = fs.readFileSync(WORKER_MAIN, 'utf8');
  for (const endpoint of referenced) {
    assert.equal(worker.includes(`@app.post("${endpoint}")`), true, `worker missing ${endpoint}`);
  }
});

test('WF-03 TTS payload fields match the worker TTS schema', () => {
  const workflow = workflowSources().find((item) => item.name === 'storywf03.json');
  const ttsNode = workflow.json.nodes.find((node) => node.parameters?.url?.includes('/v1/tts/svara'));
  assert.ok(ttsNode, 'WF-03 Svara TTS node exists');
  const body = String(ttsNode.parameters.jsonBody);
  const fields = [
    'project_id',
    'episode_no',
    'scene_order',
    'provider',
    'voice_text',
    'voice_id',
    'emotion',
    'pitch_multiplier',
    'rate_multiplier',
    'telegram_upload',
  ];
  for (const field of fields) {
    assert.equal(body.includes(`${field}:`), true, `WF-03 payload missing ${field}`);
  }
  const worker = fs.readFileSync(WORKER_MAIN, 'utf8');
  const schema = classBody(worker, 'TtsSynthesisRequest');
  for (const field of fields) {
    assert.match(schema, new RegExp(`\\b${field}\\s*:`), `worker TTS schema missing ${field}`);
  }
});

test('WF-03 FFmpeg payload fields match the worker FFmpeg schema', () => {
  const workflow = workflowSources().find((item) => item.name === 'storywf03.json');
  const ffmpegNode = workflow.json.nodes.find((node) => node.parameters?.url?.includes('/v1/ffmpeg/render-episode'));
  assert.ok(ffmpegNode, 'WF-03 FFmpeg node exists');
  const assembler = workflow.json.nodes.find((node) => String(node.parameters?.jsCode || '').includes('ffmpeg_cpu_payload'));
  assert.ok(assembler, 'WF-03 assembler builds ffmpeg_cpu_payload');
  const fields = ['project_id', 'episode_no', 'scenes_manifest', 'telegram_upload', 'burn_subtitles', 'engine'];
  for (const field of fields) {
    assert.equal(assembler.parameters.jsCode.includes(`${field}:`), true, `WF-03 ffmpeg payload missing ${field}`);
  }
  const worker = fs.readFileSync(WORKER_MAIN, 'utf8');
  const schema = classBody(worker, 'FfmpegEpisodeRequest');
  for (const field of fields) {
    assert.match(schema, new RegExp(`\\b${field}\\s*:`), `worker FFmpeg schema missing ${field}`);
  }
});

test('Android critical API paths are backed by backend routes', () => {
  const api = fs.readFileSync(ANDROID_API, 'utf8');
  const routes = [...api.matchAll(/@(?:GET|POST|PATCH|DELETE)\("([^"]+)"\)/g)].map((match) => match[1]);
  const backend = readTree(BACKEND_SRC)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');

  const contracts = [
    { android: 'v1/anime/projects', backend: ["'/v1/anime/projects'"] },
    { android: 'v1/anime/commands', backend: ["'/v1/anime/commands'"] },
    { android: 'api/v1/memory/read', backend: ["'/api/v1/memory'", "'/read'"] },
    { android: 'api/v1/memory/write', backend: ["'/api/v1/memory'", "'/write'"] },
    { android: 'api/v1/memory/correct', backend: ["'/api/v1/memory'", "'/correct'"] },
    { android: 'api/v1/memory/delete', backend: ["'/api/v1/memory'", "'/delete'"] },
    { android: 'api/v1/memory/reconcile', backend: ["'/api/v1/memory'", "'/reconcile'"] },
    { android: 'v1/anime/prompts', backend: ["'/v1/anime/prompts'"] },
    { android: 'v1/anime/prompts/library/meta', backend: ["'/v1/anime/prompts/library/meta'"] },
    { android: 'api/v1/auth/login', backend: ["'/api/v1/auth'", "'/login'"] },
    { android: 'v1/anime/health', backend: ["'/v1/anime/health'"] },
  ];

  const present = contracts.filter((contract) => routes.includes(contract.android));
  assert.ok(present.length >= 5, `expected at least 5 Android contracts, found ${present.length}`);
  for (const contract of present) {
    for (const fragment of contract.backend) {
      assert.equal(backend.includes(fragment), true, `backend missing ${fragment} for ${contract.android}`);
    }
  }
});

const androidApiSource = fs.readFileSync(ANDROID_API, 'utf8');
if (androidApiSource.includes('data class MemoryItemDto')) {
  test('Android memory DTO exposes backend memory item fields', () => {
    const dto = androidApiSource.slice(
      androidApiSource.indexOf('data class MemoryItemDto'),
      androidApiSource.indexOf('data class MemoryReadResultDto')
    );
    for (const field of ['id', 'owner_id', 'workspace_id', 'project_id', 'scope', 'content', 'category', 'knowledge_status', 'idempotency_key', 'created_at']) {
      assert.match(dto, new RegExp(`\\bval ${field}\\s*:`), `MemoryItemDto missing ${field}`);
    }
  });
}

test('backend CI runs the canonical workflow and cross-repo contract suites', () => {
  const ci = fs.readFileSync(path.join(H.backendRoot, '.github/workflows/backend-tests.yml'), 'utf8');
  assert.equal(ci.includes('test/static/workflows.validation.test.js'), true);
  assert.equal(ci.includes('test/static/e2e.contracts.test.js'), true);
  assert.equal(ci.includes('test/static/database.safety.test.js'), true);
});
