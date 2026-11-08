'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const mainJava = path.join(H.repoRoot, 'ai-anime-android/app/src/main/java/org/dpdns/bnai/anime');
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

test('REGRESSION: repository must not substitute the all-zero project uuid', () => {
  const source = fs.readFileSync(path.join(mainJava, 'core/network/AnimeRepository.kt'), 'utf8');
  assert.equal(source.includes(ZERO_UUID), false);
});

test('REGRESSION: StudioViewModel must not submit the all-zero project uuid', () => {
  const source = fs.readFileSync(path.join(mainJava, 'ui/studio/StudioViewModel.kt'), 'utf8');
  assert.equal(source.includes(ZERO_UUID), false);
});
