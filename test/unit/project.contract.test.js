'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const contract = H.dist('modules/anime/reads/project.contract.js');

test('Project contract canonicalizes formats and rejects unknown values', () => {
  assert.equal(contract.normalizeProjectFormat(' series '), 'SERIES');
  assert.equal(contract.normalizeProjectFormat('music-video'), 'MUSIC_VIDEO');
  assert.equal(contract.normalizeProjectFormat('reel'), 'REEL');
  assert.equal(contract.normalizeProjectFormat(undefined), 'SERIES');
  assert.throws(
    () => contract.normalizeProjectFormat('podcast'),
    (error) => error.code === 'OUTPUT_INVALID'
  );
  assert.match(contract.projectFormatRules('REEL'), /vertical-first/i);
});

test('Project contract canonicalizes language and provides display names', () => {
  assert.equal(contract.normalizeProjectLanguage('HI'), 'hi');
  assert.equal(contract.normalizeProjectLanguage('en-US'), 'en');
  assert.equal(contract.normalizeProjectLanguage(null), 'hi');
  assert.equal(contract.projectLanguageName('EN'), 'English');
  assert.throws(
    () => contract.normalizeProjectLanguage('fr'),
    (error) => error.code === 'OUTPUT_INVALID'
  );
});
