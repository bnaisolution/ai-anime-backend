'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');

const { redactSensitivePayload, isSensitivePayloadKey } = H.dist('security/payloadRedaction.js');

test('sensitive payload keys are removed recursively without dropping operational fields', () => {
  const input = {
    project_id: 'project-1',
    max_tokens: 2048,
    user_infrastructure: { groq: { api_key: 'secret' } },
    gpu_routing: { mode: 'KAGGLE_AUTO' },
    telegram_storage: { chat_id: '123' },
    provider: { accessToken: 'camel-secret', model: 'groq-fast' },
    nested: { refresh_token: 'refresh-secret', keep: 'visible' },
    list: [{ client_secret: 'client-secret', label: 'keep' }],
  };

  const redacted = redactSensitivePayload(input);

  assert.equal(redacted.project_id, 'project-1');
  assert.equal(redacted.max_tokens, 2048);
  assert.equal(redacted.user_infrastructure, undefined);
  assert.equal(redacted.gpu_routing, undefined);
  assert.equal(redacted.telegram_storage, undefined);
  assert.equal(redacted.provider.accessToken, undefined);
  assert.equal(redacted.provider.model, 'groq-fast');
  assert.equal(redacted.nested.refresh_token, undefined);
  assert.equal(redacted.nested.keep, 'visible');
  assert.equal(redacted.list[0].client_secret, undefined);
  assert.equal(redacted.list[0].label, 'keep');
});

test('sensitive key detection handles snake_case, kebab-case, and camelCase', () => {
  assert.equal(isSensitivePayloadKey('api_key'), true);
  assert.equal(isSensitivePayloadKey('api-key'), true);
  assert.equal(isSensitivePayloadKey('apiKey'), true);
  assert.equal(isSensitivePayloadKey('accessToken'), true);
  assert.equal(isSensitivePayloadKey('bot_token'), true);
  assert.equal(isSensitivePayloadKey('max_tokens'), false);
  assert.equal(isSensitivePayloadKey('token_count'), false);
});
