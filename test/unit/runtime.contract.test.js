'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const {
  buildRuntimeContract,
  normalizeEpisodeDurationMinutes,
  screenplayWordTarget,
  MIN_EPISODE_DURATION_MIN,
  MAX_EPISODE_DURATION_MIN,
} = H.dist('modules/anime/runtime/runtimeContract.js');

test('duration is clamped to the canonical 1-30 minute range', () => {
  assert.equal(MIN_EPISODE_DURATION_MIN, 1);
  assert.equal(MAX_EPISODE_DURATION_MIN, 30);
  assert.equal(normalizeEpisodeDurationMinutes(0), 1);
  assert.equal(normalizeEpisodeDurationMinutes(-5), 1);
  assert.equal(normalizeEpisodeDurationMinutes(31), 30);
  assert.equal(normalizeEpisodeDurationMinutes(999), 30);
  assert.equal(normalizeEpisodeDurationMinutes('12'), 12);
  assert.equal(normalizeEpisodeDurationMinutes(undefined), 24);
  assert.equal(normalizeEpisodeDurationMinutes('not-a-number'), 24);
});

const MATRIX = [1, 5, 10, 24, 30];

test('planning budgets are derived from the requested runtime', () => {
  const rows = [];
  for (const minutes of MATRIX) {
    const contract = buildRuntimeContract(minutes);
    rows.push({ minutes, contract });

    assert.equal(contract.target_duration_min, minutes);
    assert.equal(contract.target_duration_sec, minutes * 60);
    assert.equal(contract.dialogue_word_budget, Math.round(minutes * 60 * contract.dialogue_wps));
    assert.ok(contract.screenplay_word_range[0] < contract.screenplay_word_range[1]);
    assert.ok(contract.screenplay_word_range[0] > contract.dialogue_word_budget);
    assert.ok(contract.beat_range[0] >= 5 && contract.beat_range[1] <= 70);
    assert.ok(contract.scene_range[0] >= 3 && contract.scene_range[1] <= 90);
    assert.ok(contract.shot_range[0] >= 8 && contract.shot_range[1] <= 270);
    assert.ok(contract.min_shot_sec <= contract.avg_shot_sec);
    assert.ok(contract.avg_shot_sec <= contract.max_shot_sec);
    assert.ok(contract.act_count >= 1 && contract.act_count <= 6);
    assert.ok(contract.tolerance_sec >= 2);

    const target = screenplayWordTarget(contract);
    assert.ok(target >= contract.screenplay_word_range[0]);
    assert.ok(target <= contract.screenplay_word_range[1]);
  }

  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1].contract;
    const next = rows[i].contract;
    assert.ok(next.target_duration_sec > prev.target_duration_sec);
    assert.ok(next.dialogue_word_budget > prev.dialogue_word_budget);
    assert.ok(next.scene_range[0] >= prev.scene_range[0]);
    assert.ok(next.shot_range[0] >= prev.shot_range[0]);
    assert.ok(next.beat_range[0] >= prev.beat_range[0]);
  }
});

test('scene and shot budgets can cover the requested runtime', () => {
  for (const minutes of MATRIX) {
    const contract = buildRuntimeContract(minutes);
    const scenesLow = contract.scene_range[0];
    const shotsLow = contract.shot_range[0];
    assert.ok(scenesLow * contract.max_shot_sec * 3 >= contract.target_duration_sec * 0.75,
      `${minutes}m: ${scenesLow} scenes cannot cover the target`);
    assert.ok(shotsLow * contract.max_shot_sec >= contract.target_duration_sec * 0.75,
      `${minutes}m: ${shotsLow} shots cannot cover the target`);
  }
});

test('render tier and act count scale with runtime without hard caps below target', () => {
  assert.equal(buildRuntimeContract(1).act_count, 1);
  assert.equal(buildRuntimeContract(5).act_count, 3);
  assert.equal(buildRuntimeContract(10).act_count, 4);
  assert.equal(buildRuntimeContract(24).act_count, 6);
  assert.equal(buildRuntimeContract(30).act_count, 6);
  assert.equal(buildRuntimeContract(30).render_tier, 'HYBRID');
  assert.equal(buildRuntimeContract(1).render_tier, 'FULL_MOTION');
});
