import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import type {
  TenantDatabaseAuditRecord,
  TenantDatabaseRecord,
  TenantDataPlaneMode,
} from './tenantDatabase.types';

function dbError(message: string, cause: unknown): AnimeError {
  return new AnimeError({ code: AnimeErrorCode.INTERNAL, message, cause });
}

function missingRelation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as any)?.message ?? error ?? '');
  return /could not find the table|relation .* does not exist|schema cache/i.test(message);
}

export async function getTenantDatabaseRecord(tenantId: string): Promise<TenantDatabaseRecord | null> {
  const { data, error } = await animeSupabase
    .from('anime_tenant_databases')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle<TenantDatabaseRecord>();
  if (error && missingRelation(error)) return null;
  if (error) throw dbError('Tenant database lookup failed.', error);
  return data ?? null;
}

export async function listTenantDatabaseRecords(): Promise<any[]> {
  const { data, error } = await animeSupabase
    .from('anime_tenant_databases')
    .select('id, tenant_id, mode, provider, status, schema_version, dsn_host, database_name, last_checked_at, last_error, created_at, updated_at, anime_tenants(name, slug)')
    .order('updated_at', { ascending: false });
  if (error) throw dbError('Tenant database list failed.', error);
  return data ?? [];
}

export async function upsertTenantDatabase(input: {
  tenant_id: string;
  mode: TenantDataPlaneMode;
  provider: string;
  encrypted_dsn: string | null;
  key_version: number | null;
  dsn_fingerprint: string | null;
  dsn_host: string | null;
  database_name: string | null;
  status: string;
  created_by: string;
}): Promise<TenantDatabaseRecord> {
  const now = new Date().toISOString();
  const { data, error } = await animeSupabase
    .from('anime_tenant_databases')
    .upsert({
      ...input,
      key_version: input.key_version ?? 1,
      last_checked_at: now,
      last_error: null,
      updated_at: now,
    }, { onConflict: 'tenant_id' })
    .select()
    .single<TenantDatabaseRecord>();
  if (error) throw dbError('Tenant database save failed.', error);
  return data;
}

export async function updateTenantDatabaseHealth(input: {
  tenant_id: string;
  status: string;
  schema_version?: number;
  last_error: string | null;
}): Promise<void> {
  const { error } = await animeSupabase
    .from('anime_tenant_databases')
    .update({
      status: input.status,
      schema_version: input.schema_version ?? 0,
      last_checked_at: new Date().toISOString(),
      last_error: input.last_error,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', input.tenant_id);
  if (error) throw dbError('Tenant database health update failed.', error);
}

export async function deleteTenantDatabase(tenantId: string): Promise<void> {
  const { error } = await animeSupabase
    .from('anime_tenant_databases')
    .delete()
    .eq('tenant_id', tenantId);
  if (error) throw dbError('Tenant database delete failed.', error);
}

export async function writeTenantDatabaseAudit(input: {
  tenant_id: string;
  actor_user_id: string;
  action: TenantDatabaseAuditRecord['action'];
  status: TenantDatabaseAuditRecord['status'];
  detail?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await animeSupabase
    .from('anime_tenant_db_audit')
    .insert({
      tenant_id: input.tenant_id,
      actor_user_id: input.actor_user_id,
      action: input.action,
      status: input.status,
      detail: input.detail ?? {},
    });
  if (error) throw dbError('Tenant database audit write failed.', error);
}

export async function listTenantDatabaseAudit(tenantId: string, limit = 50): Promise<TenantDatabaseAuditRecord[]> {
  const { data, error } = await animeSupabase
    .from('anime_tenant_db_audit')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));
  if (error) throw dbError('Tenant database audit lookup failed.', error);
  return (data ?? []) as TenantDatabaseAuditRecord[];
}

export async function upsertProjectIndex(input: {
  project_id: string;
  tenant_id: string;
  data_plane: TenantDataPlaneMode;
  cutover_status: string;
  source_checksum?: string | null;
  migrated_at?: string | null;
  last_error?: string | null;
}): Promise<void> {
  const { error } = await animeSupabase
    .from('anime_tenant_project_index')
    .upsert({
      ...input,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' });
  if (error) throw dbError('Tenant project index save failed.', error);
}

export async function getProjectIndex(projectId: string): Promise<any | null> {
  const { data, error } = await animeSupabase
    .from('anime_tenant_project_index')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw dbError('Tenant project index lookup failed.', error);
  return data ?? null;
}

export async function listTenantProjectIndex(tenantId: string): Promise<any[]> {
  const { data, error } = await animeSupabase
    .from('anime_tenant_project_index')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });
  if (error) throw dbError('Tenant project index list failed.', error);
  return data ?? [];
}
