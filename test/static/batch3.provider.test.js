'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

function read(relativePath) {
  return fs.readFileSync(path.join(H.backendRoot, relativePath), 'utf8');
}

const registry = read('src/modules/anime/platform/providerRegistry.ts');
const catalog = read('src/modules/anime/platform/modelCatalog.ts');
const fallback = read('src/modules/anime/platform/universalFallback.ts');
const platformRoutes = read('src/modules/anime/platform/platform.routes.ts');

test('provider registry covers all OD-16 provider categories and paid-safety metadata', () => {
  for (const provider of ['nvidia_nim', 'openai_compatible', 'colab', 'lightning_ai', 'paid_gpu', 'vps', 's3_compatible', 'database_secondary']) {
    assert.ok(registry.includes(`id: '${provider}'`), `missing provider ${provider}`);
  }
  assert.match(registry, /billing: ProviderBilling/);
  assert.match(registry, /billing === 'platform'/);
});

test('model catalog includes task-specific models and compatibility fields', () => {
  for (const model of ['sdxl-lightning', 'sdxl-pulid', 'animatediff-lightning', 'musetalk', 'liveportrait', 'svara-tts', 'supertonic-tts', 'ffmpeg-render']) {
    assert.ok(catalog.includes(`id: '${model}'`), `missing model ${model}`);
  }
  for (const field of ['min_vram_gb', 'dependencies', 'weights', 'providers', 'quality', 'speed']) {
    assert.match(catalog, new RegExp(field), `missing model field ${field}`);
  }
  assert.match(catalog, /mode === 'advanced'/);
  assert.match(catalog, /mode === 'simple'/);
});

test('universal fallback preserves checkpoint and blocks silent platform-paid fallback', () => {
  assert.match(fallback, /checkpoint/);
  assert.match(fallback, /requires_paid_approval/);
  assert.match(fallback, /PAID_BUDGET_REQUIRED/);
  assert.match(fallback, /No safe provider is available/);
  assert.match(fallback, /allow_paid_fallback !== true/);
});

test('provider, model, and fallback routes are registered', () => {
  for (const route of ['/v1/anime/platform/providers', '/v1/anime/platform/models', '/v1/anime/platform/models/select', '/v1/anime/platform/fallback/plan']) {
    assert.ok(platformRoutes.includes(route), `missing route ${route}`);
  }
  assert.match(platformRoutes, /preHandler: \[app\.authenticate\]/);
});
