'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const {
  currentKeyVersion,
  decryptWithKeyVersion,
  encryptWithCurrentKey,
  keyCustodyStatus,
  keyForVersion,
} = H.dist('modules/anime/infrastructure/keyRegistry.js');

const KEY1 = 'batch4-key-one-encryption-material-32';
const KEY2 = 'batch4-key-two-encryption-material-32';
const KEY3 = 'batch4-key-three-encryption-material-32';

function reset() {
  delete process.env.ANIME_ENCRYPTION_KEYS;
  delete process.env.ANIME_ENCRYPTION_KEY_VERSION;
  delete process.env.ANIME_ENCRYPTION_KEY_PREVIOUS;
  delete process.env.ANIME_KMS_KEY_ID;
  process.env.ANIME_ENCRYPTION_KEY = KEY2;
}

test('legacy single-key configuration remains version 2 compatible', () => {
  reset();
  assert.equal(currentKeyVersion(), 2);
  const encrypted = encryptWithCurrentKey('{"api_key":"secret"}');
  assert.equal(encrypted.key_version, 2);
  assert.equal(decryptWithKeyVersion(encrypted.ciphertext, 2), '{"api_key":"secret"}');
});

test('versioned key registry selects the configured current version', () => {
  reset();
  process.env.ANIME_ENCRYPTION_KEYS = JSON.stringify({ 1: KEY1, 2: KEY2, 3: KEY3 });
  process.env.ANIME_ENCRYPTION_KEY_VERSION = '3';
  assert.equal(currentKeyVersion(), 3);
  assert.equal(keyForVersion(1), KEY1);
  const encrypted = encryptWithCurrentKey('{"token":"rotated"}');
  assert.equal(encrypted.key_version, 3);
  process.env.ANIME_ENCRYPTION_KEY_VERSION = '1';
  assert.equal(decryptWithKeyVersion(encrypted.ciphertext, 3), '{"token":"rotated"}');
});

test('old key versions remain decryptable after rotation', () => {
  reset();
  process.env.ANIME_ENCRYPTION_KEYS = JSON.stringify({ 1: KEY1, 2: KEY2 });
  process.env.ANIME_ENCRYPTION_KEY_VERSION = '1';
  const old = encryptWithCurrentKey('{"worker_url":"https://worker.test"}');
  process.env.ANIME_ENCRYPTION_KEY_VERSION = '2';
  assert.equal(decryptWithKeyVersion(old.ciphertext, 1), '{"worker_url":"https://worker.test"}');
  delete process.env.ANIME_ENCRYPTION_KEYS;
  delete process.env.ANIME_ENCRYPTION_KEY;
  assert.throws(() => decryptWithKeyVersion(old.ciphertext, 1), /No infrastructure encryption keys/i);
});

test('key custody reports versions and KMS readiness without exposing keys', () => {
  reset();
  process.env.ANIME_ENCRYPTION_KEYS = JSON.stringify({ 1: KEY1, 2: KEY2 });
  process.env.ANIME_KMS_KEY_ID = 'kms/anime/root';
  const status = keyCustodyStatus();
  assert.equal(status.mode, 'kms');
  assert.equal(status.root_outside_database, true);
  assert.equal(status.kms_ready, true);
  assert.deepEqual(status.versions, [1, 2]);
  assert.equal(JSON.stringify(status).includes(KEY1), false);
});

test('missing key material fails closed', () => {
  reset();
  delete process.env.ANIME_ENCRYPTION_KEY;
  assert.throws(() => encryptWithCurrentKey('{}'), /missing|shorter/i);
});
