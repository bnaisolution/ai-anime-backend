import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { assertPlatformManagedEnabled, getPlatformManagedStatus } from './platform.service';

export type PoolResource = 'gpu' | 'cpu' | 'llm' | 'storage';

export interface PoolReservationInput {
  tenantId: string;
  projectId?: string | null;
  resource: PoolResource;
  providerId: string;
  units: number;
  ttlSeconds?: number;
  idempotencyKey?: string | null;
  payload?: Record<string, unknown>;
}

export interface PoolReservationResult {
  status: 'reserved' | 'queued' | 'unavailable' | 'invalid';
  lease_id?: string;
  queue_id?: string;
  position?: number;
  expires_at?: string;
  reason?: string;
  idempotent?: boolean;
}

export interface PlatformUsageInput {
  tenantId: string;
  projectId?: string | null;
  resource: PoolResource;
  providerId: string;
  units: number;
  billableUnits?: number;
  unitPrice?: number;
  currency?: string;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PoolCapacityStatus {
  resource: string;
  provider_id: string;
  total_units: number;
  used_units: number;
  available_units: number;
  active_leases: number;
  max_concurrency: number;
  utilization_pct: number;
  enabled: boolean;
}

export function computeUsageAmount(billableUnits: number, unitPrice: number): number {
  const units = Number.isFinite(billableUnits) ? Math.max(0, billableUnits) : 0;
  const price = Number.isFinite(unitPrice) ? Math.max(0, unitPrice) : 0;
  return Math.round(units * price * 1_000_000) / 1_000_000;
}

export function computePoolAvailability(totalUnits: number, usedUnits: number): { available_units: number; utilization_pct: number; saturated: boolean } {
  const total = Number.isFinite(totalUnits) ? Math.max(0, totalUnits) : 0;
  const used = Number.isFinite(usedUnits) ? Math.max(0, usedUnits) : 0;
  const available = Math.max(0, total - used);
  const utilization = total > 0 ? Math.round((used / total) * 10000) / 100 : 0;
  return { available_units: available, utilization_pct: utilization, saturated: available <= 0 };
}

function positiveUnits(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Pool units must be a positive number.' });
  }
  return value;
}

function billingEnabled(): boolean {
  return process.env.ANIME_PLATFORM_BILLING_ENABLED === 'true';
}

export async function getPlatformPoolStatus(): Promise<{
  enabled: boolean;
  billing_enabled: boolean;
  capacities: PoolCapacityStatus[];
  queued: number;
}> {
  const platform = getPlatformManagedStatus();
  const [{ data: capacities, error: capacityError }, { data: leases, error: leaseError }, { count: queued, error: queueError }] = await Promise.all([
    animeSupabase.from('anime_platform_pool_capacity').select('*').order('resource'),
    animeSupabase.from('anime_platform_leases').select('resource, provider_id, units').in('status', ['reserved', 'active']).gt('expires_at', new Date().toISOString()),
    animeSupabase.from('anime_platform_queue').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
  ]);
  if (capacityError) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Platform pool capacity lookup failed.', cause: capacityError });
  if (leaseError) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Platform pool lease lookup failed.', cause: leaseError });
  if (queueError) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Platform pool queue lookup failed.', cause: queueError });

  const usage = new Map<string, { units: number; leases: number }>();
  for (const lease of leases ?? []) {
    const key = `${lease.resource}:${lease.provider_id}`;
    const current = usage.get(key) ?? { units: 0, leases: 0 };
    current.units += Number(lease.units ?? 0);
    current.leases += 1;
    usage.set(key, current);
  }

  const statuses: PoolCapacityStatus[] = (capacities ?? []).map((row: any) => {
    const key = `${row.resource}:${row.provider_id}`;
    const used = usage.get(key) ?? { units: 0, leases: 0 };
    const availability = computePoolAvailability(Number(row.total_units ?? 0), used.units);
    return {
      resource: String(row.resource),
      provider_id: String(row.provider_id),
      total_units: Number(row.total_units ?? 0),
      used_units: used.units,
      available_units: availability.available_units,
      active_leases: used.leases,
      max_concurrency: Number(row.max_concurrency ?? 1),
      utilization_pct: availability.utilization_pct,
      enabled: Boolean(row.enabled),
    };
  });

  return { enabled: platform.enabled, billing_enabled: platform.billing_enabled, capacities: statuses, queued: Number(queued ?? 0) };
}

export async function reservePlatformCapacity(input: PoolReservationInput): Promise<PoolReservationResult> {
  assertPlatformManagedEnabled('pool reservation');
  const units = positiveUnits(input.units);
  const ttlSeconds = Math.min(86_400, Math.max(30, Math.floor(input.ttlSeconds ?? 900)));
  const { data, error } = await animeSupabase.rpc('reserve_anime_platform_capacity', {
    p_tenant_id: input.tenantId,
    p_project_id: input.projectId ?? null,
    p_resource: input.resource,
    p_provider_id: input.providerId,
    p_units: units,
    p_ttl_seconds: ttlSeconds,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_payload: input.payload ?? {},
  });
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Platform pool reservation failed.', cause: error });
  return data as PoolReservationResult;
}

export async function releasePlatformLease(tenantId: string, leaseId: string): Promise<{ status: string; lease_id?: string }> {
  assertPlatformManagedEnabled('pool release');
  const { data, error } = await animeSupabase.rpc('release_anime_platform_lease', { p_lease_id: leaseId, p_tenant_id: tenantId });
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Platform pool release failed.', cause: error });
  return data as { status: string; lease_id?: string };
}

export async function recordPlatformUsage(input: PlatformUsageInput): Promise<{ status: string; usage_id: string; amount: number; currency: string; idempotent: boolean }> {
  assertPlatformManagedEnabled('usage metering');
  const units = Math.max(0, Number(input.units));
  const billing = billingEnabled();
  const billableUnits = billing ? Math.max(0, Number(input.billableUnits ?? units)) : 0;
  const unitPrice = billing ? Math.max(0, Number(input.unitPrice ?? 0)) : 0;
  const { data, error } = await animeSupabase.rpc('record_anime_platform_usage', {
    p_tenant_id: input.tenantId,
    p_project_id: input.projectId ?? null,
    p_resource: input.resource,
    p_provider_id: input.providerId,
    p_units: units,
    p_billable_units: billableUnits,
    p_unit_price: unitPrice,
    p_currency: input.currency ?? 'USD',
    p_idempotency_key: input.idempotencyKey ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Platform usage metering failed.', cause: error });
  return data as { status: string; usage_id: string; amount: number; currency: string; idempotent: boolean };
}

export async function listPlatformQueue(tenantId: string): Promise<any[]> {
  const { data, error } = await animeSupabase.from('anime_platform_queue')
    .select('id, project_id, resource, provider_id, units, priority, status, created_at')
    .eq('tenant_id', tenantId).eq('status', 'queued')
    .order('priority', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Platform queue lookup failed.', cause: error });
  return data ?? [];
}

export async function cancelPlatformQueueItem(tenantId: string, queueId: string): Promise<{ status: string }> {
  const { data, error } = await animeSupabase.from('anime_platform_queue')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', queueId).eq('tenant_id', tenantId).eq('status', 'queued')
    .select('id').maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Platform queue cancellation failed.', cause: error });
  return { status: data ? 'cancelled' : 'not_found' };
}

export async function drainPlatformQueue(resource: PoolResource, providerId: string, limit = 10): Promise<{ promoted: number; queued: number }> {
  assertPlatformManagedEnabled('queue drain');
  const { data, error } = await animeSupabase.from('anime_platform_queue')
    .select('*').eq('resource', resource).eq('provider_id', providerId).eq('status', 'queued')
    .order('priority', { ascending: true }).order('created_at', { ascending: true }).limit(Math.min(50, Math.max(1, limit)));
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Platform queue drain lookup failed.', cause: error });
  let promoted = 0;
  for (const item of data ?? []) {
    const result = await reservePlatformCapacity({
      tenantId: item.tenant_id,
      projectId: item.project_id,
      resource,
      providerId,
      units: Number(item.units),
      idempotencyKey: item.idempotency_key,
      payload: item.payload ?? {},
    });
    if (result.status === 'reserved') {
      await animeSupabase.from('anime_platform_queue')
        .update({ status: 'leased', updated_at: new Date().toISOString() })
        .eq('id', item.id).eq('status', 'queued');
      promoted += 1;
    }
  }
  return { promoted, queued: (data ?? []).length - promoted };
}

export async function getPlatformBillingSummary(tenantId: string, from?: string, to?: string): Promise<{
  tenant_id: string; currency: string; units: number; billable_units: number; amount: number;
  by_resource: Record<string, { units: number; billable_units: number; amount: number }>;
}> {
  let query = animeSupabase.from('anime_platform_usage')
    .select('resource, units, billable_units, amount, currency')
    .eq('tenant_id', tenantId).neq('status', 'void');
  if (from) query = query.gte('recorded_at', from);
  if (to) query = query.lte('recorded_at', to);
  const { data, error } = await query;
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Platform billing summary failed.', cause: error });
  let units = 0;
  let billable = 0;
  let amount = 0;
  let currency = 'USD';
  const byResource: Record<string, { units: number; billable_units: number; amount: number }> = {};
  for (const row of data ?? []) {
    const u = Number(row.units ?? 0);
    const b = Number(row.billable_units ?? 0);
    const a = Number(row.amount ?? 0);
    units += u; billable += b; amount += a;
    currency = String(row.currency || currency);
    const key = String(row.resource || 'unknown');
    byResource[key] ??= { units: 0, billable_units: 0, amount: 0 };
    byResource[key].units += u;
    byResource[key].billable_units += b;
    byResource[key].amount += a;
  }
  return { tenant_id: tenantId, currency, units, billable_units: billable, amount: Math.round(amount * 1_000_000) / 1_000_000, by_resource: byResource };
}
