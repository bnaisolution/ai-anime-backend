'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const workerRoot = path.join(H.repoRoot, 'anime-cpu-worker');
const mainPy = fs.readFileSync(path.join(workerRoot, 'main.py'), 'utf8');
const requirements = fs.readFileSync(path.join(workerRoot, 'requirements.txt'), 'utf8');

test('worker exposes the FastAPI endpoints consumed by n8n workflows', () => {
  const endpoints = [
    '@app.post("/v1/tts/svara")',
    '@app.post("/v1/tts/supertonic")',
    '@app.post("/v1/ffmpeg/render-episode")',
    '@app.get("/health")',
  ];
  for (const endpoint of endpoints) assert.equal(mainPy.includes(endpoint), true, `missing ${endpoint}`);
});

test('worker request schemas declare the contract fields', () => {
  const fields = [
    'class TtsSynthesisRequest',
    'class SfxTrackItem',
    'class SceneManifestItem',
    'class FfmpegEpisodeRequest',
    'class TelegramUploadConfig',
  ];
  for (const field of fields) assert.equal(mainPy.includes(field), true, `missing ${field}`);
});

test('worker has no literal Telegram bot token, AWS key, or GitHub token', () => {
  assert.equal(/TELEGRAM_BOT_TOKEN\s*=\s*["'][0-9]+:[A-Za-z0-9_-]+["']/.test(mainPy), false);
  assert.equal(/AKIA[0-9A-Z]{16}/.test(mainPy), false);
  assert.equal(/ghp_[A-Za-z0-9]{20,}/.test(mainPy), false);
});

test('worker secrets are read from the environment', () => {
  assert.match(mainPy, /os\.getenv\("TELEGRAM_BOT_TOKEN"/);
  assert.match(mainPy, /os\.getenv\("TELEGRAM_STORAGE_CHAT_ID"/);
});
