'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const { mintWorkerJobToken, verifyWorkerJobToken } = H.dist('modules/anime/workers/workerToken.js');

const base = {
  job_id: 'job-1',
  project_id: 'project-1',
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  scope: ['tts'],
};

test('minted worker token verifies with the required scope', () => {
  const token = mintWorkerJobToken(base);
  const claims = verifyWorkerJobToken(token, 'tts');
  assert.equal(claims.job_id, 'job-1');
  assert.equal(claims.project_id, 'project-1');
  assert.equal(claims.user_id, 'user-1');
  assert.ok(claims.scope.includes('tts'));
});

test('worker token rejects a missing scope', () => {
  const token = mintWorkerJobToken(base);
  assert.throws(() => verifyWorkerJobToken(token, 'ffmpeg'), /scope ffmpeg/);
});

test('worker token rejects tampering', () => {
  const token = mintWorkerJobToken(base);
  const [payload, signature] = token.split('.');
  const tampered = `${payload.slice(0, -1)}A.${signature}`;
  assert.throws(() => verifyWorkerJobToken(tampered, 'tts'), /signature/);
});

test('worker token rejects expiry', () => {
  const token = mintWorkerJobToken({ ...base, ttl_seconds: 1 }, 1000);
  assert.throws(() => verifyWorkerJobToken(token, 'tts', 1002), /expired/);
});

test('worker token rejects a future issued-at', () => {
  const token = mintWorkerJobToken(base, 2000);
  assert.throws(() => verifyWorkerJobToken(token, 'tts', 1000), /issued-at/);
});
