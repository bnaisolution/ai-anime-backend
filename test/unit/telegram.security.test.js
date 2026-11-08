'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const H = require('../helpers/env');
const {
  assertSafeTelegramUrl,
  buildTelegramDownloadUrl,
  isPrivateOrInternalHost,
  safeMediaContentType,
  TelegramProxyError,
  validateTelegramBotToken,
  validateTelegramFileId,
} = H.dist('modules/anime/media/telegram.security.js');

const FILE_ID = 'AgACAgQAAxkBAAIBY2F0ZmlsZTE';
const BOT_TOKEN = '123456789:stage4-test-telegram-token';

function isProxyError(code) {
  return (error) => error instanceof TelegramProxyError && error.code === code;
}

test('Telegram file id validation rejects unsafe or malformed values', () => {
  assert.equal(validateTelegramFileId(FILE_ID), FILE_ID);
  for (const value of ['../../etc/passwd', 'http://127.0.0.1', 'short', 'abc def', 'a'.repeat(513)]) {
    assert.throws(() => validateTelegramFileId(value), isProxyError('MEDIA_REQUEST_INVALID'));
  }
});

test('Telegram bot token validation never accepts client-shaped or missing values', () => {
  assert.equal(validateTelegramBotToken(BOT_TOKEN), BOT_TOKEN);
  for (const value of [undefined, '', 'client-supplied-token', '123456789:short', 'http://127.0.0.1/x']) {
    assert.throws(() => validateTelegramBotToken(value), isProxyError('TELEGRAM_MEDIA_NOT_CONFIGURED'));
  }
});

test('private and internal destination hosts are detected', () => {
  for (const host of ['localhost', 'app.localhost', '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fc00::1', 'fe80::1']) {
    assert.equal(isPrivateOrInternalHost(host), true, host);
  }
  for (const host of ['api.telegram.org', '8.8.8.8', '1.1.1.1']) {
    assert.equal(isPrivateOrInternalHost(host), false, host);
  }
});

test('Telegram destination validation rejects unsafe URLs and redirects are not followed', () => {
  for (const value of [
    'http://api.telegram.org/file/bot123/file.jpg',
    'https://127.0.0.1/file.jpg',
    'https://api.telegram.org.evil.invalid/file.jpg',
    'https://user:pass@api.telegram.org/file.jpg',
    'https://api.telegram.org:8443/file.jpg',
  ]) {
    assert.throws(() => assertSafeTelegramUrl(new URL(value)), isProxyError('TELEGRAM_DESTINATION_INVALID'));
  }
  assert.equal(assertSafeTelegramUrl(new URL('https://api.telegram.org/file/bot123/file.jpg')).hostname, 'api.telegram.org');
});

test('Telegram file paths cannot turn into arbitrary destinations', () => {
  const url = buildTelegramDownloadUrl(BOT_TOKEN, 'videos/file_1.mp4');
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'api.telegram.org');
  assert.equal(url.pathname.includes('videos/file_1.mp4'), true);

  for (const path of ['', '../secret', '/etc/passwd', 'videos\\secret', 'videos/%2e%2e/secret', 'videos//secret', 'videos/\u0000secret']) {
    assert.throws(() => buildTelegramDownloadUrl(BOT_TOKEN, path), isProxyError('TELEGRAM_DESTINATION_INVALID'));
  }
});

test('media content types are limited to a safe allowlist', () => {
  assert.equal(safeMediaContentType('videos/file.mp4', 'application/octet-stream'), 'video/mp4');
  assert.equal(safeMediaContentType('images/file.png', 'text/html'), 'image/png');
  assert.equal(safeMediaContentType('unknown.bin', 'text/html'), 'application/octet-stream');
  assert.equal(safeMediaContentType('unknown.bin', 'application/octet-stream'), 'application/octet-stream');
});
