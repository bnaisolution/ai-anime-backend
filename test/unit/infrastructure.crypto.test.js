'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const {
  encryptConfig,
  encryptConfigLegacy,
  decryptConfig,
  getCipherVersion,
  maskConfig,
} = H.dist('modules/anime/infrastructure/infrastructure.crypto.js');

const KEY = 'batch4-current-encryption-key-32-bytes';
const PREVIOUS = 'batch4-previous-encryption-key-32-bytes';

test('new infrastructure configs use version 2 and round-trip', () => {
  const ciphertext = encryptConfig(JSON.stringify({ api_key: 'secret' }), KEY);
  assert.equal(getCipherVersion(ciphertext), 2);
  assert.equal(ciphertext.startsWith('v2:'), true);
  assert.deepEqual(JSON.parse(decryptConfig(ciphertext, KEY)), { api_key: 'secret' });
});

test('legacy configs remain decryptable after the version upgrade', () => {
  const legacy = encryptConfigLegacy(JSON.stringify({ worker_url: 'https://worker.test' }), PREVIOUS);
  assert.equal(getCipherVersion(legacy), 1);
  assert.deepEqual(JSON.parse(decryptConfig(legacy, KEY, [PREVIOUS])), { worker_url: 'https://worker.test' });
});

test('maskConfig recursively masks nested secrets and arrays', () => {
  const masked = maskConfig({
    kaggle_primary: { username: 'alice', api_key: 'super-secret-kaggle-key' },
    telegram_storage: [{ bot_token: '123456:telegram-secret-token', chat_id: '42' }],
    worker_url: 'https://worker.test',
  });
  assert.equal(masked.kaggle_primary.api_key, 'supe****-key');
  assert.equal(masked.telegram_storage[0].bot_token, '1234****oken');
  assert.equal(masked.telegram_storage[0].chat_id, '42');
  assert.equal(masked.worker_url, 'https://worker.test');
});

test('tampered ciphertext fails authentication', () => {
  const ciphertext = encryptConfig('{"api_key":"secret"}', KEY);
  const tampered = `${ciphertext.slice(0, -2)}AA`;
  assert.throws(() => decryptConfig(tampered, KEY));
});

test('decryption fails closed when no supplied key matches', () => {
  const ciphertext = encryptConfig('{"api_key":"secret"}', KEY);
  assert.throws(() => decryptConfig(ciphertext, PREVIOUS));
});
