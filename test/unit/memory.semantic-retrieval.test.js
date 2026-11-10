'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../helpers/env');
const { installFakeSupabase } = require('../helpers/fake-supabase');

process.env.GEMINI_API_KEY = 'test-gemini-key';
const { retrieveContext, writeMemory } = H.dist('modules/anime/intelligence/memory.service.js');

const PROJECT = '33333333-3333-4333-8333-333333333333';
const OTHER_PROJECT = '44444444-4444-4444-8444-444444444444';

function hasFilter(call, op, col, value) {
  return call.filters.some((filter) => filter.op === op && filter.col === col && filter.value === value);
}

function installEmbeddingFetch(values = [0.1, 0.2, 0.3]) {
  const original = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('embedContent')) {
      return {
        ok: true,
        json: async () => ({ embedding: { values } }),
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return () => { global.fetch = original; };
}

function installFailingFetch() {
  const original = global.fetch;
  global.fetch = async () => { throw new Error('embedding unavailable'); };
  return () => { global.fetch = original; };
}

test('semantic retrieval uses the real embedding path and scopes the RPC to the project', async () => {
  const restoreFetch = installEmbeddingFetch([0.1, 0.2, 0.3]);
  try {
    const semanticRow = { id: 'semantic-1', content: 'Hero remembers the promise', similarity: 0.91 };
    const { state } = installFakeSupabase(async (call) => {
      if (call.table === 'memory_knowledge' && call.action === 'select') {
        return { data: [], error: null };
      }
      return { data: null, error: null };
    }, (name, args) => {
      if (name === 'match_memory_knowledge') return { data: [semanticRow], error: null };
      return { data: null, error: null };
    });

    const result = await retrieveContext(PROJECT, 'promise');
    assert.deepEqual(result, [semanticRow]);
    assert.equal(state.rpcCalls.length, 1);
    assert.equal(state.rpcCalls[0].name, 'match_memory_knowledge');
    assert.equal(state.rpcCalls[0].args.p_project_id, PROJECT);
    assert.equal(state.rpcCalls[0].args.p_match_count, 3);
    assert.equal(state.rpcCalls[0].args.p_query_embedding, '[0.1,0.2,0.3]');
    assert.equal(state.calls.some((call) => call.table === 'memory_knowledge'), false);
  } finally {
    restoreFetch();
  }
});

test('writeMemory stores the embedding vector only for the target project', async () => {
  const restoreFetch = installEmbeddingFetch([0.4, 0.5]);
  try {
    const { state } = installFakeSupabase(async (call) => {
      if (call.table === 'memory_knowledge' && call.action === 'insert') {
        return { data: { id: 'memory-1', ...(Array.isArray(call.payload) ? call.payload[0] : call.payload) }, error: null };
      }
      return { data: null, error: null };
    });
    const row = await writeMemory(OTHER_PROJECT, 'FACT', 'The moon is artificial', { source: 'test' });
    assert.equal(row.project_id, OTHER_PROJECT);
    const insert = state.calls.find((call) => call.table === 'memory_knowledge' && call.action === 'insert');
    const payload = Array.isArray(insert.payload) ? insert.payload[0] : insert.payload;
    assert.equal(payload.project_id, OTHER_PROJECT);
    assert.equal(payload.embedding, '[0.4,0.5]');
    assert.equal(payload.memory_type, 'FACT');
  } finally {
    restoreFetch();
  }
});

test('embedding failure falls back to project-scoped lexical retrieval', async () => {
  const restoreFetch = installFailingFetch();
  try {
    const lexicalRow = { id: 'lexical-1', content: 'The promise was broken' };
    const { state } = installFakeSupabase(async (call) => {
      if (call.table === 'memory_knowledge' && call.action === 'select') {
        return { data: [lexicalRow], error: null };
      }
      return { data: null, error: null };
    });
    const result = await retrieveContext(PROJECT, 'promise');
    assert.deepEqual(result, [lexicalRow]);
    assert.equal(state.rpcCalls.length, 0);
    const lexical = state.calls.find((call) => call.table === 'memory_knowledge' && call.action === 'select');
    assert.ok(lexical);
    assert.ok(hasFilter(lexical, 'eq', 'project_id', PROJECT));
    assert.ok(lexical.filters.some((filter) => filter.op === 'ilike' && filter.col === 'content'));
    assert.ok(lexical.orders.some((order) => order.col === 'created_at' && order.options?.ascending === false));
    assert.equal(lexical.limit, 3);
  } finally {
    restoreFetch();
  }
});

test('empty lexical result falls back to recent project memories without crossing tenants', async () => {
  const restoreFetch = installFailingFetch();
  try {
    const recentRow = { id: 'recent-1', content: 'Most recent memory' };
    const { state } = installFakeSupabase(async (call) => {
      if (call.table === 'memory_knowledge' && call.action === 'select') {
        if (call.filters.some((filter) => filter.op === 'ilike')) return { data: [], error: null };
        return { data: [recentRow], error: null };
      }
      return { data: null, error: null };
    });
    const result = await retrieveContext(OTHER_PROJECT, 'unknown phrase');
    assert.deepEqual(result, [recentRow]);
    const selects = state.calls.filter((call) => call.table === 'memory_knowledge' && call.action === 'select');
    assert.equal(selects.length, 2);
    for (const select of selects) {
      assert.ok(hasFilter(select, 'eq', 'project_id', OTHER_PROJECT));
    }
  } finally {
    restoreFetch();
  }
});
