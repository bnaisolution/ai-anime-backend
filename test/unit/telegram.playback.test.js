'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const H = require('../helpers/env');
const {
  mintMediaPlaybackToken,
  verifyMediaPlaybackToken,
} = H.dist('modules/anime/media/telegram.playback.js');

const FILE_ID = 'AgACAgQAAxkBAAIBY2F0ZmlsZTE';
const PROJECT_ID = 'd946a6a6-02e3-45b4-9a88-61674a186306';
const USER_ID = '6deb5189-777b-411e-81fd-4010ca9021e2';

test('media playback token round-trips and is bound to file, project, and user', () => {
  process.env.MEDIA_PLAYBACK_SECRET = 'playback-test-secret';
  const token = mintMediaPlaybackToken({ fileId: FILE_ID, projectId: PROJECT_ID, userId: USER_ID, ttlSeconds: 300 });
  const claims = verifyMediaPlaybackToken(token);
  assert.equal(claims.fileId, FILE_ID);
  assert.equal(claims.projectId, PROJECT_ID);
  assert.equal(claims.userId, USER_ID);
});

test('media playback token rejects tampering and expiry', () => {
  process.env.MEDIA_PLAYBACK_SECRET = 'playback-test-secret';
  const token = mintMediaPlaybackToken({ fileId: FILE_ID, projectId: PROJECT_ID, userId: USER_ID, ttlSeconds: 60 });
  assert.equal(verifyMediaPlaybackToken(`${token}x`), null);
  const payload = token.split('.')[0];
  const forged = Buffer.from(JSON.stringify({ s: 'media_playback', f: FILE_ID, p: PROJECT_ID, u: USER_ID, e: 9999999999 })).toString('base64url');
  assert.equal(verifyMediaPlaybackToken(`${forged}.${token.split('.')[1]}`), null);
  const expiredPayload = Buffer.from(JSON.stringify({ s: 'media_playback', f: FILE_ID, p: PROJECT_ID, u: USER_ID, e: 1 })).toString('base64url');
  assert.equal(verifyMediaPlaybackToken(expiredPayload), null);
});

test('media playback token fails closed without a configured secret', () => {
  delete process.env.MEDIA_PLAYBACK_SECRET;
  delete process.env.ANIME_WORKFLOW_GATEWAY_TOKEN;
  assert.throws(() => mintMediaPlaybackToken({ fileId: FILE_ID, projectId: PROJECT_ID, userId: USER_ID }), /secret/);
  assert.equal(verifyMediaPlaybackToken('anything.signature'), null);
});
