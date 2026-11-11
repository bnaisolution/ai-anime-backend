'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../helpers/env');

const DIR = path.join(H.backendRoot, 'n8n-workflows');
const workflows = fs.readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => ({ name, json: JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')) }));

function httpNodes(workflow) {
  return workflow.json.nodes.filter((node) => node.type === 'n8n-nodes-base.httpRequest');
}

function headersOf(node) {
  return node.parameters.headerParameters?.parameters || [];
}

test('workflows never call Supabase or provider APIs directly', () => {
  const forbidden = [
    /\$env\.SUPABASE_URL/,
    /\$env\.SUPABASE_SERVICE_ROLE_KEY/,
    /\$env\.GROQ_API_KEY/,
    /\$env\.GEMINI_API_KEY/,
    /service_role/,
    /api\.groq\.com/,
    /generativelanguage\.googleapis\.com/,
    /api\.openai\.com/,
  ];
  for (const workflow of workflows) {
    for (const node of httpNodes(workflow)) {
      const url = String(node.parameters.url || '');
      for (const pattern of forbidden) {
        assert.equal(pattern.test(url), false, `${workflow.name} / ${node.name} matches ${pattern}`);
      }
    }
  }
});

test('database and provider traffic is routed through the Anime backend gateway', () => {
  let dbCount = 0;
  let llmCount = 0;
  for (const workflow of workflows) {
    for (const node of httpNodes(workflow)) {
      const url = String(node.parameters.url || '');
      if (url.includes('/v1/anime/internal/workflow/db')) {
        dbCount += 1;
        const headers = headersOf(node);
        const token = headers.find((header) => /^(x-anime-workflow-token|x-anime-workflow-system-token)$/.test(header.name));
        assert.ok(token, `${workflow.name} / ${node.name}: gateway token header`);
        assert.match(token.value, /\$env\.ANIME_WORKFLOW_(GATEWAY|SYSTEM)_TOKEN/);
        assert.ok(headers.some((header) => header.name === 'x-anime-timestamp'), `${workflow.name} / ${node.name}: timestamp`);
        assert.ok(headers.some((header) => header.name === 'x-anime-nonce'), `${workflow.name} / ${node.name}: nonce`);
        assert.equal(headers.some((header) => /^(authorization|apikey)$/i.test(header.name)), false, `${workflow.name} / ${node.name}: direct credential header`);
      }
      if (url.includes('/v1/anime/internal/workflow/llm')) {
        llmCount += 1;
        const headers = headersOf(node);
        const token = headers.find((header) => header.name === 'x-anime-workflow-token');
        assert.ok(token, `${workflow.name} / ${node.name}: gateway token header`);
        assert.match(token.value, /\$env\.ANIME_WORKFLOW_GATEWAY_TOKEN/);
        assert.equal(headers.some((header) => /^(authorization|apikey)$/i.test(header.name)), false, `${workflow.name} / ${node.name}: direct credential header`);
      }
    }
  }
  assert.ok(dbCount > 0, 'database gateway must be used');
  assert.ok(llmCount > 0, 'provider gateway must be used');
});

test('system-scoped workflows use the system gateway token', () => {
  for (const workflow of workflows) {
    if (!/storywf13/i.test(workflow.name)) continue;
    for (const node of httpNodes(workflow)) {
      const url = String(node.parameters.url || '');
      if (!url.includes('/v1/anime/internal/workflow/db')) continue;
      const headers = headersOf(node);
      assert.ok(headers.some((header) => header.name === 'x-anime-workflow-system-token'), `${workflow.name} / ${node.name}: system token`);
      assert.equal(headers.some((header) => header.name === 'x-anime-workflow-token'), false, `${workflow.name} / ${node.name}: no project token`);
    }
  }
});
