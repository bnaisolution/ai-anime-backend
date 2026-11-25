'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const { resolveRequestedSeasonNo, resolveRequestedEpisodeNo } = H.dist('modules/anime/commands/commands.service.js');

const PROJECT = '22222222-2222-4222-8222-222222222222';

function body(extra = {}) {
  return { intent: 'GENERATE_EPISODE', project_id: PROJECT, ...extra };
}

test('season resolution prefers the explicit top-level value', () => {
  assert.equal(resolveRequestedSeasonNo(body({ season_no: 3, payload: { season_no: 2 } })), 3);
});

test('season resolution falls back to payload season keys so clients cannot silently land in season 1', () => {
  assert.equal(resolveRequestedSeasonNo(body({ payload: { season_no: 2 } })), 2);
  assert.equal(resolveRequestedSeasonNo(body({ payload: { seasonNo: 4 } })), 4);
  assert.equal(resolveRequestedSeasonNo(body({ payload: { season_number: 5 } })), 5);
});

test('season resolution ignores invalid values and defaults to season 1', () => {
  assert.equal(resolveRequestedSeasonNo(body({ season_no: 0, payload: { season_no: -2 } })), 1);
  assert.equal(resolveRequestedSeasonNo(body({ payload: { season_no: 'abc' } })), 1);
  assert.equal(resolveRequestedSeasonNo(body()), 1);
});

test('episode resolution uses payload keys and never yields NaN', () => {
  assert.equal(resolveRequestedEpisodeNo(body({ episode_no: 7 })), 7);
  assert.equal(resolveRequestedEpisodeNo(body({ payload: { episode_no: 3 } })), 3);
  assert.equal(resolveRequestedEpisodeNo(body({ payload: { episode_number: 9 } })), 9);
  assert.equal(resolveRequestedEpisodeNo(body()), 1);
  assert.equal(Number.isNaN(resolveRequestedEpisodeNo(body({ payload: { episode_no: 'x' } }))), false);
});
