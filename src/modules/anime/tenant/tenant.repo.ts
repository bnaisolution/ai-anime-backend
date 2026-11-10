import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import type { TenantMemberRecord, TenantRecord } from './tenant.types';

function dbError(message: string, cause: unknown): AnimeError {
  return new AnimeError({ code: AnimeErrorCode.INTERNAL, message, cause });
}

export async function listActiveMemberships(userId: string): Promise<TenantMemberRecord[]> {
  const { data, error } = await animeSupabase
    .from('anime_tenant_members')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) throw dbError('Tenant membership lookup failed.', error);
  return (data ?? []) as TenantMemberRecord[];
}

export async function getMembership(userId: string, tenantId: string): Promise<TenantMemberRecord | null> {
  const { data, error } = await animeSupabase
    .from('anime_tenant_members')
    .select('*')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle<TenantMemberRecord>();
  if (error) throw dbError('Tenant membership lookup failed.', error);
  return data ?? null;
}

export async function getTenant(tenantId: string): Promise<TenantRecord | null> {
  const { data, error } = await animeSupabase
    .from('anime_tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle<TenantRecord>();
  if (error) throw dbError('Tenant lookup failed.', error);
  return data ?? null;
}

export async function listTenantsByIds(tenantIds: string[]): Promise<TenantRecord[]> {
  if (tenantIds.length === 0) return [];
  const { data, error } = await animeSupabase
    .from('anime_tenants')
    .select('*')
    .in('id', tenantIds);
  if (error) throw dbError('Tenant lookup failed.', error);
  return (data ?? []) as TenantRecord[];
}

export async function insertTenant(input: {
  name: string;
  slug: string;
  created_by: string;
  plan?: string;
  is_platform_managed?: boolean;
}): Promise<TenantRecord> {
  const { data, error } = await animeSupabase
    .from('anime_tenants')
    .insert({
      name: input.name,
      slug: input.slug,
      created_by: input.created_by,
      plan: input.plan ?? 'byod',
      is_platform_managed: input.is_platform_managed ?? false,
    })
    .select()
    .single<TenantRecord>();
  if (error) throw dbError('Tenant creation failed.', error);
  return data;
}

export async function insertMember(input: {
  tenant_id: string;
  user_id: string;
  role: string;
  is_default?: boolean;
}): Promise<TenantMemberRecord> {
  if (input.is_default) {
    await animeSupabase
      .from('anime_tenant_members')
      .update({ is_default: false })
      .eq('user_id', input.user_id)
      .eq('status', 'active');
  }
  const { data, error } = await animeSupabase
    .from('anime_tenant_members')
    .insert({
      tenant_id: input.tenant_id,
      user_id: input.user_id,
      role: input.role,
      is_default: input.is_default ?? false,
      status: 'active',
    })
    .select()
    .single<TenantMemberRecord>();
  if (error) throw dbError('Tenant membership creation failed.', error);
  return data;
}

export async function setDefaultMembership(userId: string, tenantId: string): Promise<void> {
  await animeSupabase
    .from('anime_tenant_members')
    .update({ is_default: false })
    .eq('user_id', userId)
    .eq('status', 'active');
  const { error } = await animeSupabase
    .from('anime_tenant_members')
    .update({ is_default: true })
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  if (error) throw dbError('Tenant default update failed.', error);
}

export async function getProjectTenant(projectId: string): Promise<string | null> {
  const { data, error } = await animeSupabase
    .from('projects')
    .select('id, tenant_id')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw dbError('Project tenant lookup failed.', error);
  const tenantId = data?.tenant_id;
  return typeof tenantId === 'string' && tenantId ? tenantId : null;
}
