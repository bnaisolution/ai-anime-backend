import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { listTenants, resolveTenant } from '../tenant/tenant.service';

export interface QuotaStatus {
  tenant_id: string | null;
  configured: boolean;
  daily_limit_units: number | null;
  used_units: number;
  remaining_units: number | null;
  exceeded: boolean;
  by_service: Record<string, number>;
}

function dailyLimit(): number | null {
  const raw = Number(process.env.ANIME_TENANT_DAILY_UNIT_LIMIT || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

async function resolveQuotaTenantId(userId: string, tenantId?: string | null): Promise<string | null> {
  if (tenantId) {
    const resolved = await resolveTenant(userId, tenantId);
    return resolved.tenant.id;
  }
  const tenants = await listTenants(userId);
  if (tenants.length === 0) return null;
  const defaultTenant = tenants.find((tenant) => tenant.is_default) ?? tenants[0];
  return defaultTenant.id;
}

export async function getQuotaStatus(userId: string, tenantId?: string | null): Promise<QuotaStatus> {
  const resolvedTenantId = await resolveQuotaTenantId(userId, tenantId);
  if (!resolvedTenantId) {
    return {
      tenant_id: null,
      configured: false,
      daily_limit_units: dailyLimit(),
      used_units: 0,
      remaining_units: dailyLimit(),
      exceeded: false,
      by_service: {},
    };
  }

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { data, error } = await animeSupabase
    .from('quota_usage')
    .select('service_type, accumulated_units, usage_date')
    .eq('tenant_id', resolvedTenantId)
    .gte('usage_date', since.toISOString().slice(0, 10));
  if (error) {
    throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Quota lookup failed.', cause: error });
  }

  const byService: Record<string, number> = {};
  let used = 0;
  for (const row of data ?? []) {
    const units = Number(row.accumulated_units ?? 0);
    if (!Number.isFinite(units)) continue;
    used += units;
    const service = String(row.service_type || 'unknown');
    byService[service] = (byService[service] ?? 0) + units;
  }
  const limit = dailyLimit();
  return {
    tenant_id: resolvedTenantId,
    configured: true,
    daily_limit_units: limit,
    used_units: used,
    remaining_units: limit === null ? null : Math.max(0, limit - used),
    exceeded: limit !== null && used >= limit,
    by_service: byService,
  };
}

export async function assertQuotaAvailable(userId: string, tenantId: string | null | undefined, additionalUnits = 0): Promise<QuotaStatus> {
  const status = await getQuotaStatus(userId, tenantId);
  if (status.exceeded || (status.daily_limit_units !== null && status.used_units + Math.max(0, additionalUnits) > status.daily_limit_units)) {
    throw new AnimeError({ code: AnimeErrorCode.QUOTA_EXCEEDED, message: 'Tenant quota exceeded for the current day.' });
  }
  return status;
}
