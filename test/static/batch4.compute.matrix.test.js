'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

test('independent GPU/CPU matrix route and platform pool providers are present', () => {
  const selector = fs.readFileSync(path.join(ROOT, 'src/modules/anime/platform/compute.selector.ts'), 'utf8');
  const routes = fs.readFileSync(path.join(ROOT, 'src/modules/anime/platform/platform.routes.ts'), 'utf8');
  const registry = fs.readFileSync(path.join(ROOT, 'src/modules/anime/platform/providerRegistry.ts'), 'utf8');

  assert.match(selector, /selectComputeMatrix/);
  assert.match(selector, /gpu_mode/);
  assert.match(selector, /cpu_mode/);
  assert.match(selector, /platform_gpu_pool/);
  assert.match(selector, /platform_cpu_pool/);
  assert.match(selector, /getPlatformPoolStatus/);
  assert.match(routes, /compute\/matrix/);
  assert.match(registry, /id: 'platform_gpu_pool'/);
  assert.match(registry, /id: 'platform_cpu_pool'/);
  assert.match(registry, /billing: 'platform'/);
});
