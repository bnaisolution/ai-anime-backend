'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const { buildFallbackPlan, assertFallbackAllowed } = H.dist('modules/anime/platform/universalFallback.js');

test('primary-only configuration works without fallback', () => {
  const plan = buildFallbackPlan({ candidates: [{ provider_id: 'kaggle' }], primary_provider: 'kaggle' });
  assert.equal(plan.selected_provider, 'kaggle');
  assert.equal(plan.fallback, false);
  assert.equal(plan.requires_paid_approval, false);
});

test('secondary provider is used only when primary is unavailable', () => {
  const plan = buildFallbackPlan({
    candidates: [
      { provider_id: 'kaggle', available: false, reason: 'quota exhausted' },
      { provider_id: 'colab' },
    ],
    primary_provider: 'kaggle',
    secondary_provider: 'colab',
  });
  assert.equal(plan.selected_provider, 'colab');
  assert.equal(plan.fallback, true);
  assert.equal(plan.steps[0].skipped, true);
});

test('manual mode never falls back beyond the primary provider', () => {
  const plan = buildFallbackPlan({
    candidates: [{ provider_id: 'kaggle', available: false }, { provider_id: 'colab' }],
    primary_provider: 'kaggle',
    secondary_provider: 'colab',
    mode: 'manual',
  });
  assert.equal(plan.selected_provider, null);
});

test('platform-paid fallback requires explicit approval and is never silent', () => {
  const plan = buildFallbackPlan({
    candidates: [
      { provider_id: 'kaggle', available: false },
      { provider_id: 'paid_gpu', billing: 'platform' },
    ],
    primary_provider: 'kaggle',
  });
  assert.equal(plan.selected_provider, null);
  assert.equal(plan.requires_paid_approval, true);
  assert.throws(() => assertFallbackAllowed(plan), (error) => error.code === 'PAID_BUDGET_REQUIRED');
});

test('checkpoint is preserved for safe resume', () => {
  const checkpoint = { scene_order: 3, stage: 'IMAGE_READY' };
  const plan = buildFallbackPlan({
    candidates: [{ provider_id: 'kaggle', available: false, supports_checkpoint: true }],
    primary_provider: 'kaggle',
    checkpoint,
  });
  assert.equal(plan.selected_provider, null);
  assert.equal(plan.can_resume, true);
  assert.deepEqual(plan.resume_from, checkpoint);
  assert.match(plan.reason, /state is preserved/);
});
