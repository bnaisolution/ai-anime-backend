import { Client, Pool } from 'pg';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { tenantClientConnection, validateTenantDsn } from '../tenant/tenantDatabase.validation';
import type { ScopedDbRequest } from './workflowGateway.db';

const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;
const RESERVED_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'or', 'and', 'not']);
const FILTER_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike']);
const MAX_LIMIT = 5000;
const MAX_ROWS = 100;
const MAX_BODY_COLUMNS = 100;
const MAX_IN_VALUES = 500;

export interface TenantDbResult {
  status: number;
  contentType: string | null;
  text: string;
  body?: unknown;
}

interface TenantDbClientLike {
  connect(): Promise<unknown>;
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
  end(): Promise<void>;
}

type TenantDbClientFactory = (dsn: string) => TenantDbClientLike;

interface OrderTerm {
  column: string;
  direction: 'asc' | 'desc';
}

function queryInvalid(message: string): never {
  throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message });
}

function assertIdentifier(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!IDENTIFIER_RE.test(normalized)) queryInvalid(`Invalid ${label}.`);
  return normalized;
}

function quoteIdentifier(value: string, label: string): string {
  return `"${assertIdentifier(value, label)}"`;
}

function tableReference(table: string): string {
  return `"anime_data".${quoteIdentifier(table, 'database table')}`;
}

function parsePath(path: string): URLSearchParams {
  const question = path.indexOf('?');
  return new URLSearchParams(question === -1 ? '' : path.slice(question + 1));
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseColumns(params: URLSearchParams): string {
  const raw = params.get('select');
  if (!raw || raw.trim() === '*') return '*';
  const columns = [...new Set(raw.split(',').map((part) => assertIdentifier(part, 'select column')))];
  if (columns.length === 0 || columns.length > MAX_BODY_COLUMNS) queryInvalid('Invalid select columns.');
  return columns.map((column) => `"${column}"`).join(', ');
}

function parseOrder(params: URLSearchParams): OrderTerm[] {
  const raw = params.getAll('order').join(',');
  if (!raw.trim()) return [];
  return raw.split(',').map((part) => {
    const pieces = part.trim().split('.');
    if (pieces.length > 2) queryInvalid('Invalid order clause.');
    const column = assertIdentifier(pieces[0], 'order column');
    const direction = (pieces[1] || 'asc').toLowerCase();
    if (direction !== 'asc' && direction !== 'desc') queryInvalid('Invalid order direction.');
    return { column, direction };
  });
}

function parseIntegerParam(params: URLSearchParams, name: string, max: number): number | undefined {
  const values = params.getAll(name);
  if (values.length === 0) return undefined;
  if (values.length > 1) queryInvalid(`Multiple ${name} values are not allowed.`);
  if (!/^\d+$/.test(values[0])) queryInvalid(`Invalid ${name}.`);
  const value = Number(values[0]);
  if (!Number.isSafeInteger(value) || value > max) queryInvalid(`Invalid ${name}.`);
  return value;
}

function parseLimit(params: URLSearchParams): number | undefined {
  return parseIntegerParam(params, 'limit', MAX_LIMIT);
}

function parseOffset(params: URLSearchParams): number | undefined {
  return parseIntegerParam(params, 'offset', MAX_LIMIT);
}

function addValue(values: unknown[], value: unknown): string {
  values.push(value);
  return `$${values.length}`;
}

function compileCondition(raw: string, values: unknown[]): string {
  const first = raw.indexOf('.');
  const second = first === -1 ? -1 : raw.indexOf('.', first + 1);
  if (first <= 0) queryInvalid('Invalid filter expression.');
  const column = quoteIdentifier(raw.slice(0, first), 'filter column');
  const op = raw.slice(first + 1, second === -1 ? raw.length : second).trim().toLowerCase();
  const operand = second === -1 ? '' : raw.slice(second + 1);
  if (!op) queryInvalid('Invalid filter operator.');

  if (op === 'is') {
    const normalized = operand.trim().toLowerCase();
    if (normalized === 'null') return `${column} is null`;
    if (normalized === 'true' || normalized === 'false') return `${column} is ${normalized}`;
    queryInvalid('Unsupported is filter value.');
  }

  if (op === 'in') {
    const trimmed = operand.trim();
    if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) queryInvalid('Invalid in filter.');
    const items = splitTopLevel(trimmed.slice(1, -1));
    if (items.length === 0) return 'false';
    if (items.length > MAX_IN_VALUES) queryInvalid('Too many in filter values.');
    return `${column} in (${items.map((item) => addValue(values, item)).join(', ')})`;
  }

  if (!FILTER_OPS.has(op)) queryInvalid(`Unsupported filter operator ${op}.`);
  const placeholder = addValue(values, operand);
  if (op === 'like' || op === 'ilike') return `${column} ${op} ${placeholder}`;
  const sqlOp = op === 'eq' ? '=' : op === 'neq' ? '<>' : op === 'gt' ? '>' : op === 'gte' ? '>=' : op === 'lt' ? '<' : op === 'lte' ? '<=' : op;
  return `${column} ${sqlOp} ${placeholder}`;
}

function compileLogic(raw: string, values: unknown[]): string {
  const expression = raw.trim();
  if (!expression) queryInvalid('Empty compound filter.');
  if (expression.startsWith('(') && expression.endsWith(')')) {
    const parts = splitTopLevel(expression.slice(1, -1));
    if (parts.length === 0) queryInvalid('Empty compound filter.');
    return `(${parts.map((part) => compileLogic(part, values)).join(' or ')})`;
  }

  for (const operator of ['and', 'or'] as const) {
    const prefix = `${operator}(`;
    if (expression.startsWith(prefix) && expression.endsWith(')')) {
      const parts = splitTopLevel(expression.slice(prefix.length, -1));
      if (parts.length === 0) queryInvalid('Empty compound filter.');
      return `(${parts.map((part) => compileLogic(part, values)).join(operator === 'and' ? ' and ' : ' or ')})`;
    }
  }
  if (expression.startsWith('not(')) queryInvalid('not filters are not supported.');
  return compileCondition(expression, values);
}

function compileWhere(params: URLSearchParams, values: unknown[]): string {
  const clauses: string[] = [];
  for (const [key, value] of params.entries()) {
    if (RESERVED_PARAMS.has(key)) continue;
    clauses.push(compileCondition(`${key}.${value}`, values));
  }
  for (const value of params.getAll('or')) {
    clauses.push(compileLogic(value, values));
  }
  for (const value of params.getAll('and')) {
    clauses.push(compileLogic(value, values));
  }
  if (params.has('not')) queryInvalid('not filters are not supported.');
  return clauses.length > 0 ? ` where ${clauses.join(' and ')}` : '';
}

function normalizeRows(body: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(body) ? body : [body];
  if (rows.length === 0) queryInvalid('Database write body is required.');
  if (rows.length > MAX_ROWS) queryInvalid(`At most ${MAX_ROWS} rows may be written per request.`);
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) queryInvalid('Database write body must be an object or array of objects.');
    const entries = Object.entries(row as Record<string, unknown>);
    if (entries.length === 0) queryInvalid('Database write body may not be empty.');
    if (entries.length > MAX_BODY_COLUMNS) queryInvalid('Database write body has too many columns.');
    return row as Record<string, unknown>;
  });
}

function rowColumns(rows: Record<string, unknown>[]): string[] {
  const columns = Object.keys(rows[0]);
  for (const row of rows) {
    if (Object.keys(row).length !== columns.length || columns.some((column) => !Object.prototype.hasOwnProperty.call(row, column))) {
      queryInvalid('All inserted rows must have the same columns.');
    }
  }
  return columns;
}

function compileInsert(scoped: ScopedDbRequest, params: URLSearchParams, values: unknown[]): string {
  const rows = normalizeRows(scoped.body);
  const columns = rowColumns(rows).map((column) => assertIdentifier(column, 'write column'));
  const tuples = rows.map((row) => `(${columns.map((column) => addValue(values, row[column])).join(', ')})`);
  let sql = `insert into ${tableReference(scoped.table)} (${columns.map((column) => `"${column}"`).join(', ')}) values ${tuples.join(', ')}`;

  const onConflict = params.get('on_conflict');
  if (onConflict) {
    const conflictColumns = onConflict.split(',').map((column) => assertIdentifier(column, 'on_conflict column'));
    if (conflictColumns.some((column) => !columns.includes(column))) {
      queryInvalid('on_conflict columns must be present in the write body.');
    }
    const prefer = String(scoped.prefer || '').toLowerCase();
    if (prefer.includes('resolution=merge-duplicates')) {
      const updates = columns
        .filter((column) => !conflictColumns.includes(column))
        .map((column) => `"${column}" = excluded."${column}"`);
      sql += ` on conflict (${conflictColumns.map((column) => `"${column}"`).join(', ')})`;
      sql += updates.length > 0 ? ` do update set ${updates.join(', ')}` : ' do nothing';
    } else if (prefer.includes('resolution=ignore-duplicates')) {
      sql += ` on conflict (${conflictColumns.map((column) => `"${column}"`).join(', ')}) do nothing`;
    } else {
      sql += ` on conflict (${conflictColumns.map((column) => `"${column}"`).join(', ')}) do nothing`;
    }
  }
  return `${sql} returning *`;
}

function compileUpdate(scoped: ScopedDbRequest, params: URLSearchParams, values: unknown[]): string {
  if (!scoped.body || typeof scoped.body !== 'object' || Array.isArray(scoped.body)) {
    queryInvalid('Database update body must be an object.');
  }
  const entries = Object.entries(scoped.body as Record<string, unknown>);
  if (entries.length === 0) queryInvalid('Database update body may not be empty.');
  const assignments = entries.map(([column, value]) => `${quoteIdentifier(column, 'write column')} = ${addValue(values, value)}`);
  const where = compileWhere(params, values);
  if (!where) queryInvalid('Unbounded database updates are not allowed.');
  return `update ${tableReference(scoped.table)} set ${assignments.join(', ')}${where} returning *`;
}

function compileSelect(scoped: ScopedDbRequest, params: URLSearchParams, values: unknown[]): string {
  const order = parseOrder(params);
  const limit = parseLimit(params);
  const offset = parseOffset(params);
  let sql = `select ${parseColumns(params)} from ${tableReference(scoped.table)}${compileWhere(params, values)}`;
  if (order.length > 0) {
    sql += ` order by ${order.map((term) => `"${term.column}" ${term.direction}`).join(', ')}`;
  }
  if (limit !== undefined) sql += ` limit ${limit}`;
  if (offset !== undefined) sql += ` offset ${offset}`;
  return sql;
}

export function buildTenantDbStatement(scoped: ScopedDbRequest): { text: string; values: unknown[] } {
  const params = parsePath(scoped.path);
  const values: unknown[] = [];
  if (scoped.method === 'GET') return { text: compileSelect(scoped, params, values), values };
  if (scoped.method === 'POST') return { text: compileInsert(scoped, params, values), values };
  if (scoped.method === 'PATCH') return { text: compileUpdate(scoped, params, values), values };
  queryInvalid('Unsupported database method.');
}

function wantsRepresentation(scoped: ScopedDbRequest): boolean {
  return String(scoped.prefer || '').toLowerCase().includes('return=representation');
}

function resultForStatement(scoped: ScopedDbRequest, rows: any[]): TenantDbResult {
  if (scoped.method === 'GET') return { status: 200, contentType: 'application/json; charset=utf-8', text: JSON.stringify(rows), body: rows };
  if (scoped.method === 'POST') {
    const body = wantsRepresentation(scoped) ? rows : null;
    return {
      status: 201,
      contentType: body ? 'application/json; charset=utf-8' : null,
      text: body ? JSON.stringify(body) : '',
      body,
    };
  }
  const body = wantsRepresentation(scoped) ? rows : null;
  return {
    status: body ? 200 : 204,
    contentType: body ? 'application/json; charset=utf-8' : null,
    text: body ? JSON.stringify(body) : '',
    body,
  };
}

function mapDatabaseError(error: unknown): AnimeError {
  if (error instanceof AnimeError) return error;
  const code = String((error as any)?.code || '');
  if (code === '23505' || code === '23503') {
    return new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, httpStatus: 409, message: 'Database write conflict.', cause: error });
  }
  if (code === '22P02' || code === '22007' || code === '22008' || code === '42703' || code === '42P01') {
    return new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Database request is invalid.', cause: error });
  }
  return new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Tenant database request failed.', cause: error });
}

function defaultClientFactory(dsn: string): TenantDbClientLike {
  const validated = validateTenantDsn(dsn);
  const connection = tenantClientConnection(validated);
  return new Client({
    connectionString: connection.connectionString,
    ssl: connection.ssl,
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
  });
}

const tenantPools = new Map<string, Pool>();

function defaultPool(dsn: string): Pool {
  const existing = tenantPools.get(dsn);
  if (existing) return existing;
  const validated = validateTenantDsn(dsn);
  const connection = tenantClientConnection(validated);
  const pool = new Pool({
    connectionString: connection.connectionString,
    ssl: connection.ssl,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
    allowExitOnIdle: true,
  });
  pool.on('error', () => undefined);
  tenantPools.set(dsn, pool);
  return pool;
}

let clientFactory: TenantDbClientFactory = defaultClientFactory;

const MAX_TENANT_DB_CONCURRENCY = 4;
let activeTenantDbRequests = 0;
const tenantDbWaiters: Array<() => void> = [];

async function acquireTenantDbSlot(): Promise<void> {
  if (activeTenantDbRequests < MAX_TENANT_DB_CONCURRENCY) {
    activeTenantDbRequests += 1;
    return;
  }
  await new Promise<void>((resolve) => tenantDbWaiters.push(resolve));
  activeTenantDbRequests += 1;
}

function releaseTenantDbSlot(): void {
  activeTenantDbRequests -= 1;
  const next = tenantDbWaiters.shift();
  if (next) next();
}

export function setTenantDbClientFactoryForTests(factory: TenantDbClientFactory | null): void {
  clientFactory = factory ?? defaultClientFactory;
}

export async function executeTenantDbRequest(scoped: ScopedDbRequest, dsn: string): Promise<TenantDbResult> {
  const statement = buildTenantDbStatement(scoped);
  await acquireTenantDbSlot();
  try {
    if (clientFactory === defaultClientFactory) {
      const client = await defaultPool(dsn).connect();
      try {
        const result = await client.query(statement.text, statement.values);
        return resultForStatement(scoped, result.rows ?? []);
      } catch (error) {
        throw mapDatabaseError(error);
      } finally {
        client.release();
      }
    }
    const client = clientFactory(dsn);
    try {
      await client.connect();
      const result = await client.query(statement.text, statement.values);
      return resultForStatement(scoped, result.rows ?? []);
    } catch (error) {
      throw mapDatabaseError(error);
    } finally {
      await client.end().catch(() => undefined);
    }
  } finally {
    releaseTenantDbSlot();
  }
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

export function mergeTenantRows(rows: any[], path: string): any[] {
  const params = parsePath(path);
  const order = parseOrder(params);
  const limit = parseLimit(params);
  const sorted = [...rows].sort((left, right) => {
    for (const term of order) {
      const comparison = compareValues(left?.[term.column], right?.[term.column]);
      if (comparison !== 0) return term.direction === 'asc' ? comparison : -comparison;
    }
    return 0;
  });
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

export function hasOffset(path: string): boolean {
  return parsePath(path).has('offset');
}
