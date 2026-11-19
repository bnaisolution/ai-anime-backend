'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const setup = H.dist('modules/anime/reads/project.setup.service.js');

test('Director project setup requires a title and fills safe defaults', () => {
  assert.throws(
    () => setup.normalizeProjectSetup({ premise: 'No title' }),
    (error) => error.code === 'OUTPUT_INVALID'
  );

  const fields = setup.normalizeProjectSetup({
    name: '  Neon Kitsune  ',
    premise: 'A fox spirit protects a rain-soaked megacity.',
  });
  assert.equal(fields.name, 'Neon Kitsune');
  assert.equal(fields.genre, 'Action / Fantasy');
  assert.equal(fields.visualMedium, 'ANIME');
  assert.equal(fields.bible.project_format, 'SERIES');
  assert.equal(fields.bible.target_episode_count, 12);
  assert.equal(fields.bible.total_seasons, 1);
  assert.equal(fields.bible.episodes_per_season, 12);
  assert.equal(fields.bible.episode_duration_min, 24);
});

test('Director project setup validates season and runtime bounds', () => {
  assert.throws(
    () => setup.normalizeProjectSetup({ name: 'Bad', total_seasons: 0 }),
    (error) => error.code === 'OUTPUT_INVALID'
  );
  assert.throws(
    () => setup.normalizeProjectSetup({ name: 'Bad', episodes_per_season: 501 }),
    (error) => error.code === 'OUTPUT_INVALID'
  );
  assert.throws(
    () => setup.normalizeProjectSetup({ name: 'Bad', episode_duration_min: 1.5 }),
    (error) => error.code === 'OUTPUT_INVALID'
  );

  const fields = setup.normalizeProjectSetup({
    name: 'Feature',
    project_format: 'movie',
    total_seasons: 2,
    episodes_per_season: 8,
    episode_duration_min: 45,
    script_word_count: 2500,
    budget_ceiling: 500,
  });
  assert.equal(fields.bible.project_format, 'MOVIE');
  assert.equal(fields.bible.total_seasons, 2);
  assert.equal(fields.bible.episodes_per_season, 8);
  assert.equal(fields.bible.episode_duration_min, 45);
  assert.equal(fields.bible.script_word_count, 2500);
  assert.equal(fields.bible.budget_ceiling, 500);
});
