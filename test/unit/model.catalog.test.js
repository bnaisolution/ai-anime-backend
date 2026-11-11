'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const {
  listModels,
  getModel,
  selectModel,
  validateModelCompatibility,
} = H.dist('modules/anime/platform/modelCatalog.js');

test('model catalog includes chat, image, animation, lip-sync, voice, and ffmpeg tasks', () => {
  const tasks = new Set(listModels().map((model) => model.task));
  for (const task of ['chat', 'embedding', 'image', 'animation', 'lipsync', 'voice', 'ffmpeg']) {
    assert.ok(tasks.has(task), `missing task ${task}`);
  }
  assert.ok(getModel('sdxl-lightning'));
  assert.ok(getModel('animatediff-lightning'));
  assert.ok(getModel('musetalk'));
  assert.ok(getModel('liveportrait'));
  assert.ok(getModel('svara-tts'));
  assert.ok(getModel('supertonic-tts'));
});

test('auto mode selects the highest-quality compatible model', () => {
  const result = selectModel({ task: 'image', provider_id: 'kaggle', vram_gb: 16, dependencies: ['torch', 'diffusers', 'insightface'], weights: ['sdxl', 'pulid'] });
  assert.equal(result.compatible, true);
  assert.equal(result.model.id, 'sdxl-pulid');
});

test('simple mode prefers speed while auto prefers quality', () => {
  const simple = selectModel({ mode: 'simple', task: 'animation', provider_id: 'kaggle', vram_gb: 16, dependencies: ['torch', 'diffusers'], weights: ['animatediff-lightning', 'animatediff'] });
  const auto = selectModel({ mode: 'auto', task: 'animation', provider_id: 'kaggle', vram_gb: 16, dependencies: ['torch', 'diffusers'], weights: ['animatediff-lightning', 'animatediff'] });
  assert.equal(simple.model.id, 'animatediff-lightning');
  assert.equal(auto.model.id, 'animatediff');
});

test('advanced mode requires an explicit model and rejects incompatible hardware', () => {
  const missing = selectModel({ mode: 'advanced', task: 'image', provider_id: 'kaggle' });
  assert.equal(missing.compatible, false);
  assert.match(missing.reason, /explicit model_id/);
  const lowVram = selectModel({ mode: 'advanced', task: 'image', provider_id: 'kaggle', model_id: 'flux-dev', vram_gb: 8, dependencies: ['torch', 'diffusers'], weights: ['flux-dev'] });
  assert.equal(lowVram.compatible, false);
  assert.match(lowVram.reason, /VRAM/);
});

test('missing dependencies, weights, provider mismatch, and paid models fail closed', () => {
  assert.equal(validateModelCompatibility(getModel('sdxl-pulid'), { task: 'image', provider_id: 'kaggle', vram_gb: 16, dependencies: ['torch'], weights: ['sdxl', 'pulid'] }).compatible, false);
  assert.equal(validateModelCompatibility(getModel('sdxl-pulid'), { task: 'image', provider_id: 'kaggle', vram_gb: 16, dependencies: ['torch', 'diffusers', 'insightface'], weights: ['sdxl'] }).compatible, false);
  assert.equal(validateModelCompatibility(getModel('sdxl-lightning'), { task: 'image', provider_id: 'groq', vram_gb: 16, dependencies: ['torch', 'diffusers'], weights: ['sdxl-lightning'] }).compatible, false);
  const paid = { ...getModel('sdxl-lightning'), paid: true };
  assert.equal(validateModelCompatibility(paid, { task: 'image', provider_id: 'kaggle', vram_gb: 16, dependencies: ['torch', 'diffusers'], weights: ['sdxl-lightning'] }).compatible, false);
  assert.equal(validateModelCompatibility(paid, { task: 'image', provider_id: 'kaggle', vram_gb: 16, dependencies: ['torch', 'diffusers'], weights: ['sdxl-lightning'], allow_paid_fallback: true }).compatible, true);
});
