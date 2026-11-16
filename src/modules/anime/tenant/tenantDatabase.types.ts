export type TenantDataPlaneMode = 'central' | 'byod' | 'platform_managed';
export type TenantDatabaseStatus = 'pending' | 'active' | 'paused' | 'error' | 'disabled';
export type TenantDatabaseProvider = 'supabase' | 'postgres' | 'platform';

export interface TenantDatabaseRecord {
  id: string;
  tenant_id: string;
  mode: TenantDataPlaneMode;
  provider: TenantDatabaseProvider;
  encrypted_dsn: string | null;
  key_version: number;
  dsn_fingerprint: string | null;
  dsn_host: string | null;
  database_name: string | null;
  status: TenantDatabaseStatus;
  schema_version: number;
  last_checked_at: string | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantDatabasePublicDto {
  tenant_id: string;
  mode: TenantDataPlaneMode;
  provider: TenantDatabaseProvider;
  status: TenantDatabaseStatus;
  dsn_configured: boolean;
  dsn_fingerprint: string | null;
  host: string | null;
  database: string | null;
  schema_version: number;
  last_checked_at: string | null;
  last_error: string | null;
  byod_enabled: boolean;
  platform_db_enabled: boolean;
}

export interface TenantDatabaseAuditRecord {
  id: string;
  tenant_id: string;
  actor_user_id: string | null;
  action: 'test' | 'connect' | 'disconnect' | 'health_check' | 'migrate' | 'rollback' | 'provision';
  status: 'started' | 'success' | 'failed';
  detail: Record<string, unknown>;
  created_at: string;
}

export interface ValidatedTenantDsn {
  dsn: string;
  host: string;
  port: number;
  database: string;
  username: string;
  sslmode: string;
  provider: Exclude<TenantDatabaseProvider, 'platform'>;
}

export interface TenantDataPlaneResolution {
  tenant_id: string;
  mode: TenantDataPlaneMode;
  provider: TenantDatabaseProvider;
  central: boolean;
  dsn: string | null;
  reason?: string;
}
