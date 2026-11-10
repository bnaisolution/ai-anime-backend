'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');

const {
  estimateTokens,
  computeBackoffMs,
  parseRetryAfterMs,
  parseRateLimitResetMs,
  reserveTokenBudget,
  resetLowTpmStateForTests,
} = require('../helpers/env').dist('core/ai-brain/modelRouter.js');

test('token estimates are deterministic and conservative', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('a'.repeat(400)), 100);
  assert.equal(estimateTokens(''), 1);
});

test('backoff is exponential, jittered, and honours Retry-After', () => {
  assert.equal(computeBackoffMs(0, 0, () => 0), 500);
  assert.equal(computeBackoffMs(1, 0, () => 0), 1000);
  assert.equal(computeBackoffMs(2, 0, () => 0), 2000);
  assert.ok(computeBackoffMs(0, 0, () => 0.5) > 500);
  assert.equal(computeBackoffMs(0, 9000, () => 0), 9000);
});

test('Retry-After and rate-limit reset headers are parsed', () => {
  assert.equal(parseRetryAfterMs('2'), 2000);
  assert.equal(parseRetryAfterMs(null), 0);
  assert.equal(parseRateLimitResetMs('1500ms'), 1500);
  assert.equal(parseRateLimitResetMs('2s'), 2000);
  assert.equal(parseRateLimitResetMs('1m'), 60000);
  assert.equal(parseRateLimitResetMs('bogus'), 0);
});

test('low-TPM budget refuses work once the per-minute budget is exhausted', () => {
  resetLowTpmStateForTests();
  assert.equal(reserveTokenBudget(5000), true);
  assert.equal(reserveTokenBudget(900), true);
  assert.equal(reserveTokenBudget(200), false);
  resetLowTpmStateForTests();
  assert.equal(reserveTokenBudget(200), true);
});
