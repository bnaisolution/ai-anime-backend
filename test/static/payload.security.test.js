'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const MIGRATION = fs.readFileSync(
  path.join(H.backendRoot, 'supabase/migrations/004_batch4_payload_security.sql'),
  'utf8'
);
const ROLLBACK = fs.readFileSync(
  path.join(H.backendRoot, 'supabase/migrations/004_batch4_payload_security_rollback.sql'),
  'utf8'
);
const COMMANDS = fs.readFileSync(
  path.join(H.backendRoot, 'src/modules/anime/commands/commands.service.ts'),
  'utf8'
);
const DISPATCHER = fs.readFileSync(
  path.join(H.backendRoot, 'src/modules/anime/outbox/outbox.dispatcher.ts'),
  'utf8'
);

test('batch 4 migration redacts command and outbox payloads before persistence', () => {
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.redact_sensitive_payload/);
  assert.match(MIGRATION, /BEFORE INSERT OR UPDATE OF payload ON public\.api_commands/);
  assert.match(MIGRATION, /BEFORE INSERT OR UPDATE OF payload ON public\.outbox_events/);
  assert.match(MIGRATION, /UPDATE public\.api_commands[\s\S]*redact_sensitive_payload\(payload\)/);
  assert.match(MIGRATION, /UPDATE public\.outbox_events[\s\S]*redact_sensitive_payload\(payload\)/);
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.redact_expired_payloads/);
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION public\.redact_expired_payloads\(integer\) TO service_role/);
});

test('batch 4 rollback removes only the new redaction functions and triggers', () => {
  assert.match(ROLLBACK, /DROP TRIGGER IF EXISTS trg_outbox_events_redact_payload/);
  assert.match(ROLLBACK, /DROP TRIGGER IF EXISTS trg_api_commands_redact_payload/);
  assert.match(ROLLBACK, /DROP FUNCTION IF EXISTS public\.redact_expired_payloads/);
  assert.match(ROLLBACK, /DROP FUNCTION IF EXISTS public\.redact_sensitive_payload\(jsonb\)/);
  assert.equal(/\bDELETE\s+FROM\b/i.test(ROLLBACK), false);
  assert.equal(/\bTRUNCATE\b/i.test(ROLLBACK), false);
});

test('command persistence stores redacted payloads and dispatch hydrates at the boundary', () => {
  assert.match(COMMANDS, /const persistedPayload = redactSensitivePayload\(enrichedPayload\)/);
  assert.match(COMMANDS, /const persistedOutboxPayload = redactSensitivePayload\(outboxPayload\)/);
  assert.match(COMMANDS, /payload: persistedPayload/);
  assert.match(COMMANDS, /outbox_payload: persistedOutboxPayload/);
  assert.match(DISPATCHER, /const dispatchPayload = await hydrateDispatchPayload\(payload\)/);
  assert.match(DISPATCHER, /dispatchToWf00\(dispatchPayload\)/);
  assert.match(DISPATCHER, /redactSensitivePayload\(\{ \.\.\.\(payload\.payload \|\| \{\}\), n8n_response/);
});
