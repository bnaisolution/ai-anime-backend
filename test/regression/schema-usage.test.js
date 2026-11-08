'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const loreSource = fs.readFileSync(
  path.join(H.backendRoot, 'src/modules/anime/reads/lore.routes.ts'),
  'utf8'
);
test('REGRESSION: lore scene updates must not write the missing scenes.duration_sec column', () => {
  assert.equal(/\bduration_sec\b/.test(loreSource), false);
});

test('REGRESSION: lore scene updates must not write the missing scenes.dialogue column', () => {
  assert.equal(/\bdialogue\b(?!_speaker_id)/.test(loreSource), false);
});

test('REGRESSION: lore command cancellation must not write api_commands.error_message', () => {
  const uses = /api_commands[\s\S]{0,600}error_message/.test(loreSource);
  assert.equal(uses, false);
});

test('REGRESSION: lore command cancellation must not write api_commands.updated_at', () => {
  const uses = /api_commands[\s\S]{0,600}updated_at/.test(loreSource);
  assert.equal(uses, false);
});

test('REGRESSION: lore cancellation must not filter pending_actions by command_id', () => {
  const uses = /pending_actions[\s\S]{0,600}command_id|command_id[\s\S]{0,600}pending_actions/.test(loreSource);
  assert.equal(uses, false);
});

test('REGRESSION: quota reads must not select invented quota_usage fields', () => {
  for (const field of ['tokens_used', 'units_used', 'request_count']) {
    assert.equal(new RegExp(`\\b${field}\\b`).test(loreSource), false, `field ${field} is not in the live schema`);
  }
});
