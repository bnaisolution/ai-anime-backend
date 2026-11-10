'use strict';

const H = require('./env');

function defaultHandler({ mode }) {
  if (mode === 'maybeSingle' || mode === 'single') return { data: null, error: null };
  return { data: [], error: null };
}

class FakeQuery {
  constructor(state, table) {
    this.state = state;
    this.table = table;
    this.action = 'select';
    this.columns = '*';
    this.filters = [];
    this.orders = [];
    this.limitValue = null;
    this.payload = undefined;
    this.mode = 'many';
  }

  select(columns) { this.columns = columns || '*'; return this; }
  insert(payload) { this.action = 'insert'; this.payload = payload; return this; }
  upsert(payload, options) { this.action = 'upsert'; this.payload = payload; this.upsertOptions = options; return this; }
  update(payload) { this.action = 'update'; this.payload = payload; return this; }
  delete() { this.action = 'delete'; return this; }
  eq(col, value) { this.filters.push({ op: 'eq', col, value }); return this; }
  neq(col, value) { this.filters.push({ op: 'neq', col, value }); return this; }
  in(col, values) { this.filters.push({ op: 'in', col, value: values }); return this; }
  is(col, value) { this.filters.push({ op: 'is', col, value }); return this; }
  gte(col, value) { this.filters.push({ op: 'gte', col, value }); return this; }
  lt(col, value) { this.filters.push({ op: 'lt', col, value }); return this; }
  or(expression) { this.filters.push({ op: 'or', value: expression }); return this; }
  ilike(col, value) { this.filters.push({ op: 'ilike', col, value }); return this; }
  order(col, options) { this.orders.push({ col, options }); return this; }
  limit(value) { this.limitValue = value; return this; }
  maybeSingle() { this.mode = 'maybeSingle'; return this; }
  single() { this.mode = 'single'; return this; }

  then(onFulfilled, onRejected) {
    return this.execute(this.mode).then(onFulfilled, onRejected);
  }

  async execute(mode) {
    const call = {
      table: this.table,
      action: this.action,
      columns: this.columns,
      filters: this.filters,
      orders: this.orders,
      limit: this.limitValue,
      payload: this.payload,
      mode: mode || this.mode,
      upsertOptions: this.upsertOptions,
    };
    this.state.calls.push(call);
    const handler = this.state.handler || defaultHandler;
    const result = await handler(call);
    return result || defaultHandler(call);
  }
}

function installFakeSupabase(handler, rpcHandler) {
  const state = { calls: [], handler, rpcCalls: [], rpcHandler };
  const client = {
    from(table) {
      return new FakeQuery(state, table);
    },
    rpc(name, args) {
      state.rpcCalls.push({ name, args });
      const result = rpcHandler ? rpcHandler(name, args) : { data: [], error: null };
      return {
        maybeSingle() { return Promise.resolve(result); },
        single() { return Promise.resolve(result); },
        then(onFulfilled, onRejected) { return Promise.resolve(result).then(onFulfilled, onRejected); },
      };
    },
  };
  const { animeSupabase } = H.dist('modules/anime/db/anime.supabase.js');
  animeSupabase.from = client.from;
  animeSupabase.rpc = client.rpc;
  return { state, client, animeSupabase };
}

module.exports = { FakeQuery, installFakeSupabase, defaultHandler };
