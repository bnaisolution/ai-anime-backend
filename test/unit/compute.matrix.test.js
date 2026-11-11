'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const { selectComputeMatrix } = H.dist('modules/anime/platform/compute.selector.js');

const byodGpu = { id: 'gpu-1', provider_type: 'kaggle', status: 'active', capabilities: { priority: 1 } };
const byodCpu = { id: 'cpu-1', provider_type: 'github_actions', status: 'active', capabilities: { priority: 1 } };
const platformGpu = { id: 'platform-gpu', provider_type: 'custom', status: 'active', capabilities: { provider_id: 'platform_gpu_pool', platform_managed: true, priority: 1 } };
const platformCpu = { id: 'platform-cpu', provider_type: 'custom', status: 'active', capabilities: { provider_id: 'platform_cpu_pool', platform_managed: true, priority: 1 } };

const requirements = {
  gpu_task: 'image',
  cpu_task: 'ffmpeg',
  vram_gb: 16,
  dependencies: ['torch', 'diffusers', 'ffmpeg'],
  weights: ['sdxl-lightning'],
};

function enablePlatform() {
  process.env.ANIME_PLATFORM_MANAGED_ENABLED = 'true';
  process.env.ANIME_PLATFORM_MANAGED_OWNER_APPROVED = 'true';
}

function disablePlatform() {
  delete process.env.ANIME_PLATFORM_MANAGED_ENABLED;
  delete process.env.ANIME_PLATFORM_MANAGED_OWNER_APPROVED;
}

test('GPU and CPU selection are independent across all four BYOD/platform combinations', () => {
  enablePlatform();
  const candidates = [byodGpu, byodCpu, platformGpu, platformCpu];

  const byod = selectComputeMatrix(candidates, { ...requirements, gpu_mode: 'byod', cpu_mode: 'byod' });
  assert.equal(byod.gpu.provider_id, 'kaggle');
  assert.equal(byod.gpu.billing, 'user');
  assert.equal(byod.cpu.provider_id, 'github_actions');
  assert.equal(byod.cpu.billing, 'user');

  const mixedCpu = selectComputeMatrix(candidates, { ...requirements, gpu_mode: 'byod', cpu_mode: 'platform_managed' });
  assert.equal(mixedCpu.gpu.provider_id, 'kaggle');
  assert.equal(mixedCpu.cpu.provider_id, 'platform_cpu_pool');
  assert.equal(mixedCpu.cpu.billing, 'platform');
  assert.equal(mixedCpu.cpu.requires_paid_approval, true);

  const mixedGpu = selectComputeMatrix(candidates, { ...requirements, gpu_mode: 'platform_managed', cpu_mode: 'byod' });
  assert.equal(mixedGpu.gpu.provider_id, 'platform_gpu_pool');
  assert.equal(mixedGpu.gpu.billing, 'platform');
  assert.equal(mixedGpu.gpu.requires_paid_approval, true);
  assert.equal(mixedGpu.cpu.provider_id, 'github_actions');

  const platform = selectComputeMatrix(candidates, { ...requirements, gpu_mode: 'platform_managed', cpu_mode: 'platform_managed' });
  assert.equal(platform.gpu.provider_id, 'platform_gpu_pool');
  assert.equal(platform.cpu.provider_id, 'platform_cpu_pool');
  assert.equal(platform.gpu.requires_paid_approval, true);
  assert.equal(platform.cpu.requires_paid_approval, true);
  disablePlatform();
});

test('platform-managed matrix sides fail closed when activation is not approved', () => {
  disablePlatform();
  const result = selectComputeMatrix([byodGpu, byodCpu, platformGpu, platformCpu], {
    ...requirements, gpu_mode: 'platform_managed', cpu_mode: 'byod',
  });
  assert.equal(result.gpu, null);
  assert.match(result.gpu_reason, /disabled/i);
  assert.equal(result.cpu.provider_id, 'github_actions');
});

test('missing candidates produce independent reasons without failing the other engine', () => {
  enablePlatform();
  const result = selectComputeMatrix([byodGpu], { ...requirements, gpu_mode: 'byod', cpu_mode: 'platform_managed' });
  assert.equal(result.gpu.provider_id, 'kaggle');
  assert.equal(result.cpu, null);
  assert.match(result.cpu_reason, /No active CPU provider/i);
  disablePlatform();
});
