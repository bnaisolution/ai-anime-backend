'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const ALL_DIR = path.join(H.backendRoot, 'n8n-workflows-all');

function loadAuxiliary() {
  return fs.readdirSync(ALL_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ name, json: JSON.parse(fs.readFileSync(path.join(ALL_DIR, name), 'utf8')) }));
}

test('REGRESSION: every workflow in n8n-workflows-all must declare an id', () => {
  const missing = loadAuxiliary().filter((workflow) => !workflow.json.id).map((workflow) => workflow.name);
  assert.deepEqual(missing, []);
});
