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
  assert.equal(fields.bible.language, 'hi');
  assert.equal(fields.bible.visual_style, 'ANIME');
});

test('Director project setup normalizes language, visual style, and REEL format', () => {
  const fields = setup.normalizeProjectSetup({
    name: 'Vertical Cut',
    project_format: 'reel',
    language: 'EN',
    visual_style: 'real_human',
    script_word_count: 900,
  });
  assert.equal(fields.bible.project_format, 'REEL');
  assert.equal(fields.bible.language, 'en');
  assert.equal(fields.language, 'en');
  assert.equal(fields.bible.visual_style, 'REAL_HUMAN');
  assert.equal(fields.visualStyle, 'REAL_HUMAN');
  assert.equal(fields.bible.script_word_count, 900);
  assert.throws(
    () => setup.normalizeProjectSetup({ name: 'Bad Language', language: 'fr' }),
    (error) => error.code === 'OUTPUT_INVALID'
  );
  assert.throws(
    () => setup.normalizeProjectSetup({ name: 'Bad Format', project_format: 'PODCAST' }),
    (error) => error.code === 'OUTPUT_INVALID'
  );
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
    episode_duration_min: 24,
    script_word_count: 2500,
    budget_ceiling: 500,
  });
  assert.equal(fields.bible.project_format, 'MOVIE');
  assert.equal(fields.bible.total_seasons, 2);
  assert.equal(fields.bible.episodes_per_season, 8);
  assert.equal(fields.bible.episode_duration_min, 24);
  assert.equal(fields.bible.script_word_count, 2500);
  assert.equal(fields.bible.target_duration_sec, 1440);
  assert.equal(fields.bible.runtime_contract.dialogue_word_budget, 3168);
  assert.equal(fields.bible.budget_ceiling, 500);
  assert.throws(
    () => setup.normalizeProjectSetup({ name: 'Too long', episode_duration_min: 31 }),
    (error) => error.code === 'OUTPUT_INVALID'
  );
});

test('Runtime contract scales from 1 minute to 30 minutes', () => {
  const one = setup.normalizeProjectSetup({ name: 'One', episode_duration_min: 1 }).bible;
  assert.equal(one.target_duration_sec, 60);
  assert.equal(one.runtime_contract.dialogue_word_budget, 132);
  assert.equal(one.script_word_count, 242);
  assert.deepEqual(one.runtime_contract.act_count, 1);

  const thirty = setup.normalizeProjectSetup({ name: 'Thirty', episode_duration_min: 30 }).bible;
  assert.equal(thirty.target_duration_sec, 1800);
  assert.equal(thirty.runtime_contract.dialogue_word_budget, 3960);
  assert.equal(thirty.script_word_count, 7260);
  assert.equal(thirty.runtime_contract.act_count, 6);
  assert.equal(thirty.runtime_contract.render_tier, 'HYBRID');
});
