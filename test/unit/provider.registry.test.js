'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const {
  listProviders,
  getProvider,
  resolveProviderDefinition,
  assertProviderSupportsTask,
} = H.dist('modules/anime/platform/providerRegistry.js');

test('provider registry covers AI, GPU, CPU, storage, and database categories', () => {
  const categories = new Set(listProviders().map((provider) => provider.category));
  assert.deepEqual([...categories].sort(), ['ai', 'cpu', 'database', 'gpu', 'storage']);
  assert.ok(getProvider('nvidia_nim'));
  assert.ok(getProvider('colab'));
  assert.ok(getProvider('lightning_ai'));
  assert.ok(getProvider('vps'));
  assert.ok(getProvider('s3_compatible'));
  assert.ok(getProvider('database_secondary'));
});

test('provider resolution uses explicit vendor metadata before DB provider type', () => {
  assert.equal(resolveProviderDefinition('custom', { provider_id: 'nvidia_nim' }).id, 'nvidia_nim');
  assert.equal(resolveProviderDefinition('custom', { vendor: 'colab' }).id, 'colab');
  assert.equal(resolveProviderDefinition('custom', { provider: 'vps' }).id, 'vps');
  assert.equal(resolveProviderDefinition('custom', { storage_url: 'https://s3.test' }).id, 'custom_storage');
  assert.equal(resolveProviderDefinition('custom', { capabilities: { requires_gpu: true } }).id, 'custom_gpu');
});

test('provider task support is enforced', () => {
  assert.equal(assertProviderSupportsTask('groq', 'chat').id, 'groq');
  assert.throws(() => assertProviderSupportsTask('groq', 'image'), (error) => error.code === 'PROVIDER_UNAVAILABLE');
  assert.throws(() => assertProviderSupportsTask('missing', 'chat'), (error) => error.code === 'PROVIDER_UNAVAILABLE');
});
