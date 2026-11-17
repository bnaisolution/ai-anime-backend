import { Client } from 'pg';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { decryptWithKeyVersion, encryptWithCurrentKey } from '../infrastructure/keyRegistry';
import * as repo from './tenantDatabase.repo';
import { TENANT_DATA_TABLES, TENANT_PROJECT_TABLES, TENANT_SCHEMA_SQL, TENANT_SCHEMA_VERSION } from './tenantSchema';
import type {
  TenantDatabasePublicDto,
  TenantDatabaseRecord,
  TenantDataPlaneResolution,
  ValidatedTenantDsn,
} from './tenantDatabase.types';
import { tenantClientConnection, tenantDsnFingerprint, tenantDsnKey, validateTenantDsn } from './tenantDatabase.validation';


function boolEnv(name: string): boolean {
  return process.env[name] === 'true';
}

export function getHybridFlags(): { byod_enabled: boolean; platform_db_enabled: boolean } {
  return {
    byod_enabled: boolEnv('ANIME_BYOD_ENABLED'),
    platform_db_enabled: boolEnv('ANIME_PLATFORM_DB_ENABLED'),
  };
}

export function assertByodEnabled(): void {
  if (!getHybridFlags().byod_enabled) {
    throw new AnimeError({
      code: AnimeErrorCode.PROVIDER_UNAVAILABLE,
      message: 'User-owned database connections are disabled. Enable ANIME_BYOD_ENABLED after infrastructure validation.',
    });
  }
}

function publicDto(record: TenantDatabaseRecord | null, tenantId: string): TenantDatabasePublicDto {
  const flags = getHybridFlags();
  return {
    tenant_id: tenantId,
    mode: record?.mode ?? 'central',
    provider: record?.provider ?? 'platform',
    status: record?.status ?? 'active',
    dsn_configured: Boolean(record?.encrypted_dsn),
    dsn_fingerprint: record?.dsn_fingerprint ?? null,
    host: record?.dsn_host ?? null,
    database: record?.database_name ?? null,
    schema_version: Number(record?.schema_version ?? 0),
    last_checked_at: record?.last_checked_at ?? null,
    last_error: record?.last_error ?? null,
    byod_enabled: flags.byod_enabled,
    platform_db_enabled: flags.platform_db_enabled,
  };
}

function sanitizeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/postgres(ql)?:\/\/[^\s]+/gi, '[redacted]')
    .replace(/password=[^\s]+/gi, 'password=[redacted]')
    .slice(0, 240);
}

export async function getTenantDatabasePublic(tenantId: string): Promise<TenantDatabasePublicDto> {
  const record = await repo.getTenantDatabaseRecord(tenantId);
  return publicDto(record, tenantId);
}

export async function testTenantDsn(rawDsn: unknown): Promise<{
  ok: boolean;
  latency_ms: number;
  server_version: string | null;
  database: string | null;
  error: string | null;
}> {
  let validated: ValidatedTenantDsn;
  try {
    validated = validateTenantDsn(rawDsn);
  } catch (error) {
    return { ok: false, latency_ms: 0, server_version: null, database: null, error: sanitizeError(error) };
  }

  const started = Date.now();
  const client = new Client({
    ...tenantClientConnection(validated),
    connectionTimeoutMillis: 8_000,
    query_timeout: 8_000,
    statement_timeout: 8_000,
  });
  try {
    await client.connect();
    const result = await client.query('select current_database() as database, version() as server_version');
    return {
      ok: true,
      latency_ms: Date.now() - started,
      server_version: String(result.rows[0]?.server_version ?? '').split(' ').slice(0, 2).join(' ') || null,
      database: result.rows[0]?.database ? String(result.rows[0].database) : null,
      error: null,
    };
  } catch (error) {
    return { ok: false, latency_ms: Date.now() - started, server_version: null, database: null, error: sanitizeError(error) };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function connectTenantDatabase(input: {
  tenantId: string;
  userId: string;
  dsn: unknown;
}): Promise<TenantDatabasePublicDto> {
  assertByodEnabled();
  const validated = validateTenantDsn(input.dsn);
  const test = await testTenantDsn(validated.dsn);
  if (!test.ok) {
    await repo.writeTenantDatabaseAudit({
      tenant_id: input.tenantId,
      actor_user_id: input.userId,
      action: 'connect',
      status: 'failed',
      detail: { host: validated.host, database: validated.database, error: test.error },
    });
    throw new AnimeError({
      code: AnimeErrorCode.OUTPUT_INVALID,
      message: `Database connection failed: ${test.error ?? 'unknown error'}`,
    });
  }

  const encrypted = encryptWithCurrentKey(validated.dsn);
  const record = await repo.upsertTenantDatabase({
    tenant_id: input.tenantId,
    mode: 'byod',
    provider: validated.provider,
    encrypted_dsn: encrypted.ciphertext,
    key_version: encrypted.key_version,
    dsn_fingerprint: tenantDsnFingerprint(validated),
    dsn_host: validated.host,
    database_name: validated.database,
    status: 'active',
    created_by: input.userId,
  });
  await repo.writeTenantDatabaseAudit({
    tenant_id: input.tenantId,
    actor_user_id: input.userId,
    action: 'connect',
    status: 'success',
    detail: { host: validated.host, database: validated.database, latency_ms: test.latency_ms },
  });
  return publicDto(record, input.tenantId);
}

export async function disconnectTenantDatabase(input: {
  tenantId: string;
  userId: string;
}): Promise<TenantDatabasePublicDto> {
  assertByodEnabled();
  const existing = await repo.getTenantDatabaseRecord(input.tenantId);
  if (!existing) return publicDto(null, input.tenantId);
  await repo.deleteTenantDatabase(input.tenantId);
  await repo.writeTenantDatabaseAudit({
    tenant_id: input.tenantId,
    actor_user_id: input.userId,
    action: 'disconnect',
    status: 'success',
    detail: { previous_mode: existing.mode, host: existing.dsn_host, database: existing.database_name },
  });
  return publicDto(null, input.tenantId);
}

function dsnForRecord(record: TenantDatabaseRecord): string {
  if (!record.encrypted_dsn) {
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'Tenant database is not configured.' });
  }
  try {
    return decryptWithKeyVersion(record.encrypted_dsn, Number(record.key_version));
  } catch (error) {
    throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Tenant database credentials could not be decrypted.', cause: error });
  }
}

export async function checkTenantDatabaseHealth(input: {
  tenantId: string;
  userId: string;
}): Promise<{
  mode: string;
  status: string;
  reachable: boolean;
  latency_ms: number;
  schema_version: number;
  error: string | null;
}> {
  const record = await repo.getTenantDatabaseRecord(input.tenantId);
  if (!record || record.mode !== 'byod') {
    return { mode: 'central', status: 'active', reachable: true, latency_ms: 0, schema_version: 0, error: null };
  }
  const dsn = dsnForRecord(record);
  const validated = validateTenantDsn(dsn);
  const started = Date.now();
  const client = new Client({
    ...tenantClientConnection(validated),
    connectionTimeoutMillis: 8_000,
    query_timeout: 8_000,
    statement_timeout: 8_000,
  });
  try {
    await client.connect();
    const result = await client.query(
      `select
         to_regclass('anime_data.schema_migrations') is not null as schema_ready,
         coalesce((select max(version) from anime_data.schema_migrations), 0)::int as schema_version`
    );
    const schemaVersion = Number(result.rows[0]?.schema_version ?? 0);
    await repo.updateTenantDatabaseHealth({
      tenant_id: input.tenantId,
      status: 'active',
      schema_version: schemaVersion,
      last_error: null,
    });
    await repo.writeTenantDatabaseAudit({
      tenant_id: input.tenantId,
      actor_user_id: input.userId,
      action: 'health_check',
      status: 'success',
      detail: { latency_ms: Date.now() - started, schema_version: schemaVersion },
    });
    return {
      mode: 'byod',
      status: 'active',
      reachable: true,
      latency_ms: Date.now() - started,
      schema_version: schemaVersion,
      error: null,
    };
  } catch (error) {
    const message = sanitizeError(error);
    await repo.updateTenantDatabaseHealth({
      tenant_id: input.tenantId,
      status: 'error',
      schema_version: Number(record.schema_version ?? 0),
      last_error: message,
    });
    await repo.writeTenantDatabaseAudit({
      tenant_id: input.tenantId,
      actor_user_id: input.userId,
      action: 'health_check',
      status: 'failed',
      detail: { error: message },
    });
    return {
      mode: 'byod',
      status: 'error',
      reachable: false,
      latency_ms: Date.now() - started,
      schema_version: Number(record.schema_version ?? 0),
      error: message,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function resolveTenantDataPlane(tenantId: string): Promise<TenantDataPlaneResolution> {
  const flags = getHybridFlags();
  if (!flags.byod_enabled) {
    return { tenant_id: tenantId, mode: 'central', provider: 'platform', central: true, dsn: null, reason: 'byod_disabled' };
  }
  const record = await repo.getTenantDatabaseRecord(tenantId);
  if (!record || record.mode !== 'byod') {
    return { tenant_id: tenantId, mode: 'central', provider: 'platform', central: true, dsn: null, reason: 'central_default' };
  }
  if (record.status !== 'active') {
    throw new AnimeError({
      code: AnimeErrorCode.PROVIDER_UNAVAILABLE,
      message: 'The user-owned database is unavailable. Restore it from the Database tab before continuing.',
    });
  }
  return {
    tenant_id: tenantId,
    mode: 'byod',
    provider: record.provider,
    central: false,
    dsn: dsnForRecord(record),
  };
}

export async function resolveProjectDataPlane(projectId: string, tenantId: string): Promise<TenantDataPlaneResolution> {
  const index = await repo.getProjectIndex(projectId);
  if (!index || index.tenant_id !== tenantId || index.data_plane !== 'byod') {
    return { tenant_id: tenantId, mode: 'central', provider: 'platform', central: true, dsn: null, reason: 'project_central' };
  }
  return resolveTenantDataPlane(tenantId);
}

export async function resolveProjectDataPlaneById(projectId: string): Promise<TenantDataPlaneResolution> {
  if (!getHybridFlags().byod_enabled) {
    return { tenant_id: '', mode: 'central', provider: 'platform', central: true, dsn: null, reason: 'byod_disabled' };
  }
  const index = await repo.getProjectIndex(projectId);
  if (!index || index.data_plane !== 'byod') {
    return { tenant_id: '', mode: 'central', provider: 'platform', central: true, dsn: null, reason: 'project_central' };
  }
  return resolveTenantDataPlane(String(index.tenant_id));
}

export async function listActiveByodDataPlanes(): Promise<TenantDataPlaneResolution[]> {
  if (!getHybridFlags().byod_enabled) return [];
  const records = await repo.listActiveTenantDatabaseRecords();
  return records
    .filter((record) => record.mode === 'byod' && record.status === 'active' && Boolean(record.encrypted_dsn))
    .map((record) => ({
      tenant_id: record.tenant_id,
      mode: 'byod' as const,
      provider: record.provider,
      central: false,
      dsn: dsnForRecord(record),
    }));
}

export async function provisionTenantSchema(tenantId: string, userId: string): Promise<{ schema_version: number }> {
  assertByodEnabled();
  const record = await repo.getTenantDatabaseRecord(tenantId);
  if (!record || record.mode !== 'byod') {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Connect a user-owned database first.' });
  }
  const dsn = dsnForRecord(record);
  const validated = validateTenantDsn(dsn);
  const client = new Client({
    ...tenantClientConnection(validated),
    connectionTimeoutMillis: 10_000,
    query_timeout: 60_000,
    statement_timeout: 60_000,
  });
  try {
    await client.connect();
    await client.query(TENANT_SCHEMA_SQL);
    const version = await client.query('select max(version)::int as version from anime_data.schema_migrations');
    const schemaVersion = Number(version.rows[0]?.version ?? TENANT_SCHEMA_VERSION);
    await repo.updateTenantDatabaseHealth({
      tenant_id: tenantId,
      status: 'active',
      schema_version: schemaVersion,
      last_error: null,
    });
    await repo.writeTenantDatabaseAudit({
      tenant_id: tenantId,
      actor_user_id: userId,
      action: 'provision',
      status: 'success',
      detail: { schema_version: schemaVersion },
    });
    return { schema_version: schemaVersion };
  } catch (error) {
    const message = sanitizeError(error);
    await repo.writeTenantDatabaseAudit({
      tenant_id: tenantId,
      actor_user_id: userId,
      action: 'provision',
      status: 'failed',
      detail: { error: message },
    });
    throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: `Tenant schema provisioning failed: ${message}` });
  } finally {
    await client.end().catch(() => undefined);
  }
}

type CentralRow = Record<string, unknown>;

const COPY_PAGE_SIZE = 500;
const COPY_INSERT_BATCH = 100;
const TRANSIENT_TABLES = new Set(['pending_actions']);
const CENTRAL_ROLLBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchCentralProjectTable(
  table: string,
  scopeColumn: 'id' | 'project_id',
  scopeValues: string[],
): Promise<CentralRow[]> {
  const rows: CentralRow[] = [];
  for (let from = 0; ; from += COPY_PAGE_SIZE) {
    const { data, error } = await animeSupabase
      .from(table)
      .select('*')
      .in(scopeColumn, scopeValues)
      .order('id', { ascending: true })
      .range(from, from + COPY_PAGE_SIZE - 1);
    if (error) {
      throw new AnimeError({
        code: AnimeErrorCode.INTERNAL,
        message: `Central ${table} lookup failed.`,
        cause: error,
      });
    }
    const page = (data ?? []) as CentralRow[];
    rows.push(...page);
    if (page.length < COPY_PAGE_SIZE) break;
  }
  return rows;
}

async function readTenantColumns(
  client: Client,
  tables: readonly string[],
): Promise<Map<string, Map<string, string>>> {
  const result = await client.query(
    `select table_name, column_name, data_type
       from information_schema.columns
      where table_schema = 'anime_data'
        and table_name = any($1::text[])`,
    [tables],
  );
  const columns = new Map<string, Map<string, string>>();
  for (const row of result.rows) {
    const table = String(row.table_name);
    if (!columns.has(table)) columns.set(table, new Map());
    columns.get(table)!.set(String(row.column_name), String(row.data_type));
  }
  return columns;
}

function normalizeProjectRow(row: CentralRow, userId: string): CentralRow {
  const now = new Date().toISOString();
  return {
    ...row,
    user_id: row.user_id ?? userId,
    name: row.name ?? 'Untitled',
    story_bible: row.story_bible ?? {},
    current_season: row.current_season ?? 1,
    current_episode: row.current_episode ?? 0,
    is_active: row.is_active ?? false,
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
  };
}

function prepareCopyValue(value: unknown, dataType: string | undefined): unknown {
  if (value === undefined || value === null) return null;
  if (dataType === 'jsonb' || dataType === 'json') {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return value;
}

async function upsertTenantRows(
  client: Client,
  table: string,
  rows: CentralRow[],
  columnTypes: Map<string, string>,
): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]).filter((column) => columnTypes.has(column));
  if (!columns.includes('id')) {
    throw new Error(`Tenant ${table} schema is missing the id column.`);
  }
  for (let offset = 0; offset < rows.length; offset += COPY_INSERT_BATCH) {
    const batch = rows.slice(offset, offset + COPY_INSERT_BATCH);
    const values: unknown[] = [];
    const tuples: string[] = [];
    for (const row of batch) {
      const placeholders = columns.map((column) => {
        values.push(prepareCopyValue(row[column], columnTypes.get(column)));
        return `$${values.length}`;
      });
      tuples.push(`(${placeholders.join(', ')})`);
    }
    const updates = columns
      .filter((column) => column !== 'id')
      .map((column) => `"${column}" = excluded."${column}"`)
      .join(', ');
    const conflict = updates ? `do update set ${updates}` : 'do nothing';
    await client.query(
      `insert into anime_data."${table}" (${columns.map((column) => `"${column}"`).join(', ')})
       values ${tuples.join(', ')}
       on conflict ("id") ${conflict}`,
      values,
    );
  }
}

async function verifyTenantProjectCopy(
  client: Client,
  table: string,
  scopeColumn: 'id' | 'project_id',
  projectIds: string[],
  expected: number,
): Promise<void> {
  if (expected === 0) return;
  const result = await client.query(
    `select count(*)::int as count from anime_data."${table}" where "${scopeColumn}" = any($1::uuid[])`,
    [projectIds],
  );
  const actual = Number(result.rows[0]?.count ?? 0);
  if (actual < expected) {
    throw new Error(`Tenant ${table} copy is incomplete: expected at least ${expected} rows, found ${actual}.`);
  }
}

export async function migrateProjectsToTenant(input: {
  tenantId: string;
  userId: string;
  projectIds: string[];
}): Promise<{ migrated: number; project_ids: string[]; rows_copied: number; tables_copied: number }> {
  assertByodEnabled();
  const projectIds = [...new Set(input.projectIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))];
  if (projectIds.length === 0) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'At least one project id is required.' });
  }
  if (projectIds.length > 50) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Migrate at most 50 projects per request.' });
  }

  const { data: projects, error } = await animeSupabase
    .from('projects')
    .select('*')
    .in('id', projectIds)
    .eq('user_id', input.userId);
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Central project lookup failed.', cause: error });
  if ((projects ?? []).length !== projectIds.length) {
    throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'One or more projects are not owned by this user.' });
  }

  await provisionTenantSchema(input.tenantId, input.userId);
  const record = await repo.getTenantDatabaseRecord(input.tenantId);
  if (!record || record.mode !== 'byod') {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Connect a user-owned database first.' });
  }
  const dsn = dsnForRecord(record);
  const validated = validateTenantDsn(dsn);
  const client = new Client({
    ...tenantClientConnection(validated),
    connectionTimeoutMillis: 10_000,
    query_timeout: 60_000,
    statement_timeout: 60_000,
  });

  const copied: Record<string, number> = {};
  try {
    await client.connect();
    await client.query('begin');
    const columns = await readTenantColumns(client, TENANT_DATA_TABLES);
    const tables = ['projects', ...TENANT_DATA_TABLES.filter((table) => table !== 'projects' && !TRANSIENT_TABLES.has(table))];
    for (const table of tables) {
      const scopeColumn = table === 'projects' ? 'id' : 'project_id';
      const rows = await fetchCentralProjectTable(table, scopeColumn, projectIds);
      if (rows.length === 0) continue;
      const normalized = table === 'projects'
        ? rows.map((row) => normalizeProjectRow(row, input.userId))
        : rows;
      const columnTypes = columns.get(table);
      if (!columnTypes) throw new Error(`Tenant ${table} table is missing.`);
      await upsertTenantRows(client, table, normalized, columnTypes);
      await verifyTenantProjectCopy(client, table, scopeColumn, projectIds, rows.length);
      copied[table] = rows.length;
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    await repo.writeTenantDatabaseAudit({
      tenant_id: input.tenantId,
      actor_user_id: input.userId,
      action: 'migrate',
      status: 'failed',
      detail: { project_ids: projectIds, tables: copied, error: sanitizeError(error) },
    });
    throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: `Project migration failed: ${sanitizeError(error)}` });
  } finally {
    await client.end().catch(() => undefined);
  }

  for (const projectId of projectIds) {
    await repo.upsertProjectIndex({
      project_id: projectId,
      tenant_id: input.tenantId,
      data_plane: 'byod',
      cutover_status: 'byod',
      migrated_at: new Date().toISOString(),
    });
  }
  const rowsCopied = Object.values(copied).reduce((sum, count) => sum + count, 0);
  await repo.writeTenantDatabaseAudit({
    tenant_id: input.tenantId,
    actor_user_id: input.userId,
    action: 'migrate',
    status: 'success',
    detail: { project_ids: projectIds, migrated: projectIds.length, rows_copied: rowsCopied, tables: copied },
  });
  return {
    migrated: projectIds.length,
    project_ids: projectIds,
    rows_copied: rowsCopied,
    tables_copied: Object.keys(copied).length,
  };
}

export async function rollbackProjectsToCentral(input: {
  tenantId: string;
  userId: string;
  projectIds: string[];
}): Promise<{ rolled_back: number; project_ids: string[] }> {
  assertByodEnabled();
  const projectIds = [...new Set(input.projectIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))];
  if (projectIds.length === 0) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'At least one project id is required.' });
  }
  for (const projectId of projectIds) {
    const existing = await repo.getProjectIndex(projectId);
    if (!existing || existing.tenant_id !== input.tenantId) {
      throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Project is not cut over to this tenant.' });
    }
    const migratedAt = existing.migrated_at ? Date.parse(existing.migrated_at) : Number.NaN;
    if (!Number.isFinite(migratedAt) || Date.now() - migratedAt > CENTRAL_ROLLBACK_WINDOW_MS) {
      throw new AnimeError({
        code: AnimeErrorCode.OUTPUT_INVALID,
        message: 'The 7-day central rollback window has expired. Export the user-database project before switching data planes.',
      });
    }
    await repo.upsertProjectIndex({
      project_id: projectId,
      tenant_id: input.tenantId,
      data_plane: 'central',
      cutover_status: 'central',
      migrated_at: existing.migrated_at ?? null,
    });
  }
  await repo.writeTenantDatabaseAudit({
    tenant_id: input.tenantId,
    actor_user_id: input.userId,
    action: 'rollback',
    status: 'success',
    detail: { project_ids: projectIds, rolled_back: projectIds.length },
  });
  return { rolled_back: projectIds.length, project_ids: projectIds };
}

export async function listOwnerTenantDatabases(filters: repo.TenantDatabaseListFilters = {}): Promise<any[]> {
  return repo.listTenantDatabaseRecords(filters);
}

export async function listOwnerTenantDatabaseAudit(tenantId: string, limit?: number): Promise<any[]> {
  return repo.listTenantDatabaseAudit(tenantId, limit);
}

export async function recheckOwnerTenantDatabase(tenantId: string, ownerId: string): Promise<{
  mode: string;
  status: string;
  reachable: boolean;
  latency_ms: number;
  schema_version: number;
  error: string | null;
}> {
  const record = await repo.getTenantDatabaseRecord(tenantId);
  if (!record || record.mode !== 'byod') {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'A user-owned database is not connected for this tenant.' });
  }
  return checkTenantDatabaseHealth({ tenantId, userId: ownerId });
}

export { tenantDsnKey };
