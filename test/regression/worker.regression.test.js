'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

test('REGRESSION: worker runtime requirements must be pinned reproducibly', () => {
  const requirements = fs.readFileSync(path.join(H.repoRoot, 'anime-cpu-worker/requirements.txt'), 'utf8');
  const unpinned = requirements
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .filter((line) => !/^[A-Za-z0-9_.-]+==[^=]+$/.test(line));
  assert.deepEqual(unpinned, []);
});
