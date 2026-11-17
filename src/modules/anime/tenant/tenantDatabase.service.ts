import { Client } from 'pg';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { decryptWithKeyVersion, encryptWithCurrentKey } from '../infrastructure/keyRegistry';
import * as repo from './tenantDatabase.repo';
import type {
  TenantDatabasePublicDto,
  TenantDatabaseRecord,
  TenantDataPlaneResolution,
  ValidatedTenantDsn,
} from './tenantDatabase.types';
import { sslOptionsForMode, tenantDsnFingerprint, tenantDsnKey, validateTenantDsn } from './tenantDatabase.validation';

const TENANT_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS anime_data;

CREATE TABLE IF NOT EXISTS anime_data.schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.projects (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  name text NOT NULL,
  genre text,
  visual_medium text,
  description text,
  story_bible jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_season integer NOT NULL DEFAULT 1,
  current_episode integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anime_data_projects_user
  ON anime_data.projects (user_id, created_at DESC);

INSERT INTO anime_data.schema_migrations (version) VALUES (1)
ON CONFLICT (version) DO NOTHING;
`;

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
    connectionString: validated.dsn,
    ssl: sslOptionsForMode(validated.sslmode),
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
    connectionString: dsn,
    ssl: sslOptionsForMode(validated.sslmode),
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
    connectionString: dsn,
    ssl: sslOptionsForMode(validated.sslmode),
    connectionTimeoutMillis: 10_000,
    query_timeout: 20_000,
    statement_timeout: 20_000,
  });
  try {
    await client.connect();
    await client.query(TENANT_SCHEMA_SQL);
    const version = await client.query('select max(version)::int as version from anime_data.schema_migrations');
    const schemaVersion = Number(version.rows[0]?.version ?? 1);
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

export async function migrateProjectsToTenant(input: {
  tenantId: string;
  userId: string;
  projectIds: string[];
}): Promise<{ migrated: number; project_ids: string[] }> {
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
    connectionString: dsn,
    ssl: sslOptionsForMode(validated.sslmode),
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
  });

  try {
    await client.connect();
    await client.query('begin');
    for (const project of projects ?? []) {
      await client.query(
        `insert into anime_data.projects
          (id, user_id, name, genre, visual_medium, description, story_bible, current_season, current_episode, is_active, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)
         on conflict (id) do update set
           name = excluded.name,
           genre = excluded.genre,
           visual_medium = excluded.visual_medium,
           description = excluded.description,
           story_bible = excluded.story_bible,
           current_season = excluded.current_season,
           current_episode = excluded.current_episode,
           is_active = excluded.is_active,
           updated_at = excluded.updated_at`,
        [
          project.id,
          String(project.user_id ?? input.userId),
          String(project.name ?? 'Untitled'),
          project.genre ?? null,
          project.visual_medium ?? null,
          project.description ?? null,
          JSON.stringify(project.story_bible ?? {}),
          Number(project.current_season ?? 1),
          Number(project.current_episode ?? 1),
          Boolean(project.is_active ?? true),
          project.created_at ?? new Date().toISOString(),
          project.updated_at ?? new Date().toISOString(),
        ],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    await repo.writeTenantDatabaseAudit({
      tenant_id: input.tenantId,
      actor_user_id: input.userId,
      action: 'migrate',
      status: 'failed',
      detail: { project_ids: projectIds, error: sanitizeError(error) },
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
  await repo.writeTenantDatabaseAudit({
    tenant_id: input.tenantId,
    actor_user_id: input.userId,
    action: 'migrate',
    status: 'success',
    detail: { project_ids: projectIds, migrated: projectIds.length },
  });
  return { migrated: projectIds.length, project_ids: projectIds };
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
