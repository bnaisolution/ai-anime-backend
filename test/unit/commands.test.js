'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const { CommandIntent, COMMAND_INTENT_WF_MAP, CommandStatus } = H.dist('modules/anime/commands/commands.types.js');
const { computeCommandBodyHash } = H.dist('modules/anime/commands/commands.service.js');
const { signCallbackPayload, verifyCallbackSignature } = H.dist('modules/anime/callbacks/signature.js');
const { computeExponentialBackoffIso } = H.dist('modules/anime/outbox/outbox.dispatcher.js');

test('every CommandIntent maps to a workflow key', () => {
  const missing = Object.values(CommandIntent).filter((intent) => !COMMAND_INTENT_WF_MAP[intent]);
  assert.deepEqual(missing, [], `Unmapped intents: ${missing.join(', ')}`);
});

test('CREATE_PROJECT maps to WF-01 (documented backend behavior)', () => {
  assert.equal(COMMAND_INTENT_WF_MAP[CommandIntent.CREATE_PROJECT], 'WF-01');
});

test('command body hash is stable across key order and changes with payload', () => {
  const first = computeCommandBodyHash({
    intent: CommandIntent.CREATE_PROJECT,
    project_id: '11111111-1111-4111-8111-111111111111',
    mode: 'SAVE',
    payload: { name: 'Alpha', nested: { a: 1, b: 2 } },
  });
  const reordered = computeCommandBodyHash({
    payload: { nested: { b: 2, a: 1 }, name: 'Alpha' },
    mode: 'SAVE',
    project_id: '11111111-1111-4111-8111-111111111111',
    intent: CommandIntent.CREATE_PROJECT,
  });
  assert.equal(first, reordered);
  assert.match(first, /^[0-9a-f]{64}$/);

  const changed = computeCommandBodyHash({
    intent: CommandIntent.CREATE_PROJECT,
    project_id: '11111111-1111-4111-8111-111111111111',
    mode: 'SAVE',
    payload: { name: 'Beta' },
  });
  assert.notEqual(first, changed);
});

test('command status enum includes terminal statuses used by reconciliation', () => {
  assert.equal(CommandStatus.SUCCEEDED, 'SUCCEEDED');
  assert.equal(CommandStatus.FAILED, 'FAILED');
  assert.equal(CommandStatus.RECONCILING, 'RECONCILING');
  assert.equal(CommandStatus.CANCELLED, undefined, 'CANCELLED is not defined in CommandStatus (known gap)');
});

test('exponential backoff is a future ISO timestamp', () => {
  const before = Date.now();
  const iso = computeExponentialBackoffIso(1);
  const parsed = Date.parse(iso);
  assert.equal(Number.isNaN(parsed), false);
  assert.ok(parsed >= before + 1500);
  assert.ok(parsed <= before + 5000);
});

test('callback HMAC validation accepts a correct signature', () => {
  const secret = 'stage3-test-secret';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify({ status: 'COMPLETED', command_id: 'c1' });
  const signature = signCallbackPayload(timestamp, rawBody, secret);
  assert.doesNotThrow(() => verifyCallbackSignature({
    rawBody,
    signatureHeader: signature,
    timestampHeader: timestamp,
    nonceHeader: `nonce-${Date.now()}-valid`,
    secret,
  }));
});

test('callback HMAC validation rejects tampered payloads', () => {
  const secret = 'stage3-test-secret';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify({ status: 'COMPLETED' });
  const signature = signCallbackPayload(timestamp, rawBody, secret);
  assert.throws(
    () => verifyCallbackSignature({
      rawBody: JSON.stringify({ status: 'FAILED' }),
      signatureHeader: signature,
      timestampHeader: timestamp,
      nonceHeader: `nonce-${Date.now()}-tamper`,
      secret,
    }),
    (error) => error.code === 'CALLBACK_SIGNATURE_INVALID'
  );
});

test('callback HMAC validation rejects timestamps outside the 5 minute window', () => {
  const secret = 'stage3-test-secret';
  const timestamp = String(Math.floor(Date.now() / 1000) - 600);
  const rawBody = JSON.stringify({ status: 'COMPLETED' });
  const signature = signCallbackPayload(timestamp, rawBody, secret);
  assert.throws(
    () => verifyCallbackSignature({
      rawBody,
      signatureHeader: signature,
      timestampHeader: timestamp,
      nonceHeader: `nonce-${Date.now()}-stale`,
      secret,
    }),
    (error) => error.code === 'CALLBACK_SIGNATURE_INVALID'
  );
});

test('callback HMAC validation rejects replayed nonces', () => {
  const secret = 'stage3-test-secret';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify({ status: 'COMPLETED' });
  const signature = signCallbackPayload(timestamp, rawBody, secret);
  const nonceHeader = `nonce-${Date.now()}-replay`;
  const input = { rawBody, signatureHeader: signature, timestampHeader: timestamp, nonceHeader, secret };
  verifyCallbackSignature(input);
  assert.throws(
    () => verifyCallbackSignature(input),
    (error) => error.code === 'CALLBACK_REPLAY'
  );
});
