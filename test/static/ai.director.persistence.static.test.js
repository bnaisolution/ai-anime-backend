'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('director project and conversation persistence use the anime data plane', () => {
  for (const file of ['src/modules/ai/director/director.context.ts', 'src/modules/ai/director/director.conversation.ts']) {
    const source = read(file);
    assert.match(source, /animeSupabase/, `${file} must use animeSupabase`);
    assert.doesNotMatch(source, /fastify\.supabase/, `${file} must not query the central database for anime tables`);
  }
});

test('director and approval migrations are present with rollback files', () => {
  for (const migration of [
    'supabase/migrations/013_ai_director_context_actions.sql',
    'supabase/migrations/014_approval_decision_idempotency.sql',
  ]) {
    assert.ok(fs.existsSync(path.join(root, migration)), `${migration} must exist`);
    assert.ok(fs.existsSync(path.join(root, migration.replace(/\.sql$/, '_rollback.sql'))), `${migration} rollback must exist`);
  }
  assert.match(read('supabase/migrations/013_ai_director_context_actions.sql'), /director_conversations/);
  assert.match(read('supabase/migrations/013_ai_director_context_actions.sql'), /target_duration_sec/);
  assert.match(read('supabase/migrations/014_approval_decision_idempotency.sql'), /decision_idempotency_key/);
});

test('director chat supports projectless onboarding without production actions', () => {
  const routes = read('src/modules/ai/director/director.routes.ts');
  assert.match(routes, /Production actions require a project/);
  assert.match(routes, /chatAccess/);
  assert.match(routes, /preHandler:\s*\[fastify\.authenticate, chatAccess\]/);

  const service = read('src/modules/ai/director/director.service.ts');
  assert.match(service, /ONBOARDING MODE/);
  assert.match(service, /buildDirectorReadiness\(fastify, auth, null\)/);
  assert.match(service, /conversation_id:\s*null/);
  assert.match(service, /actions:\s*\[\]/);
  assert.doesNotMatch(service, /buildActionProposal\([\s\S]{0,200}projectId:\s*''/);
});

test('AI execute gateway routes through the hardened WF-00 adapter', () => {
  const source = read('src/modules/ai/ai.routes.ts');
  assert.match(source, /dispatchToWf00/);
  assert.doesNotMatch(source, /fetch\(wf00Url/);
});

test('director memory retrieval is semantic and stays on the user BYOD embedding path', () => {
  const context = read('src/modules/ai/director/director.context.ts');
  assert.match(context, /retrieveContext\(/);
  assert.match(context, /retrieveContext\(input\.projectId, memoryQuery, auth\.userId\)/);
  const service = read('src/modules/ai/director/director.service.ts');
  assert.match(service, /memoryQuery:\s*message/);
  const memory = read('src/modules/anime/intelligence/memory.service.ts');
  assert.match(memory, /getByodEmbedding/);
  assert.match(memory, /userId\s*\?\s*await getByodEmbedding/);
  const router = read('src/core/ai-brain/modelRouter.ts');
  assert.match(router, /capability:\s*'embedding'/);
  assert.match(router, /embedContent/);
});
