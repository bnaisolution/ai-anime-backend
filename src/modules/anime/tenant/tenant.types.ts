export type TenantRole = 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer';
export type TenantStatus = 'active' | 'suspended' | 'disabled';

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: string;
  is_platform_managed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantMemberRecord {
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  status: 'active' | 'revoked';
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResolvedTenant {
  tenant: TenantRecord;
  membership: TenantMemberRecord;
}

export interface TenantPublicDto {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: string;
  is_platform_managed: boolean;
  role: TenantRole;
  is_default: boolean;
}
