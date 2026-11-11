'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const {
  computePoolAvailability,
  computeUsageAmount,
} = H.dist('modules/anime/platform/platformPool.service.js');

test('pool availability reports remaining capacity and saturation', () => {
  assert.deepEqual(computePoolAvailability(10, 4), { available_units: 6, utilization_pct: 40, saturated: false });
  assert.deepEqual(computePoolAvailability(10, 10), { available_units: 0, utilization_pct: 100, saturated: true });
  assert.deepEqual(computePoolAvailability(0, 0), { available_units: 0, utilization_pct: 0, saturated: true });
  assert.deepEqual(computePoolAvailability(-5, 20), { available_units: 0, utilization_pct: 0, saturated: true });
});

test('usage amount is deterministic and never negative', () => {
  assert.equal(computeUsageAmount(2, 1.25), 2.5);
  assert.equal(computeUsageAmount(0.3333333, 3), 1);
  assert.equal(computeUsageAmount(-1, 5), 0);
  assert.equal(computeUsageAmount(Number.NaN, 5), 0);
  assert.equal(computeUsageAmount(2, -3), 0);
});
