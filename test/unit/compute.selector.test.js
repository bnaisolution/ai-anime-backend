'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const { selectComputePlan, selectComputeForUser } = H.dist('modules/anime/platform/compute.selector.js');

const active = (id, provider_type, capabilities = {}) => ({ id, provider_type, status: 'active', capabilities });

test('GPU requirements select an independent GPU provider', () => {
  const plan = selectComputePlan([
    active('gpu-1', 'own_gpu'),
    active('cpu-1', 'ffmpeg'),
  ], { requires_gpu: true });
  assert.equal(plan.engine, 'gpu');
  assert.equal(plan.provider_type, 'own_gpu');
  assert.equal(plan.fallback, false);
});

test('video requirements fall back to CPU when no GPU provider is active', () => {
  const plan = selectComputePlan([active('cpu-1', 'ffmpeg')], { requires_video: true });
  assert.equal(plan.engine, 'cpu');
  assert.equal(plan.provider_type, 'ffmpeg');
  assert.equal(plan.fallback, true);
});

test('audio and LLM requirements select their own provider classes', () => {
  const audio = selectComputePlan([active('tts-1', 'tts'), active('llm-1', 'groq')], { requires_audio: true });
  assert.equal(audio.provider_type, 'tts');
  const llm = selectComputePlan([active('tts-1', 'tts'), active('llm-1', 'groq')], { requires_llm: true });
  assert.equal(llm.provider_type, 'groq');
});

test('GPU-only requirements fail closed without an active GPU provider', () => {
  assert.throws(
    () => selectComputePlan([active('cpu-1', 'ffmpeg')], { requires_gpu: true }),
    (error) => error.code === 'PROVIDER_UNAVAILABLE'
  );
});

test('inactive providers are never selected', () => {
  assert.throws(
    () => selectComputePlan([{ id: 'gpu-1', provider_type: 'own_gpu', status: 'revoked' }], { requires_gpu: true }),
    (error) => error.code === 'PROVIDER_UNAVAILABLE'
  );
});

test('platform-managed compute is rejected while disabled', async () => {
  delete process.env.ANIME_PLATFORM_MANAGED_ENABLED;
  delete process.env.ANIME_PLATFORM_MANAGED_OWNER_APPROVED;
  await assert.rejects(
    () => selectComputeForUser('user-1', { preferred_mode: 'platform_managed' }),
    (error) => error.code === 'PLATFORM_MANAGED_DISABLED'
  );
});
