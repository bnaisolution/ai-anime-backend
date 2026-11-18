import { animeSupabase } from '../db/anime.supabase';

export interface SaasPlan {
  key: string;
  name: string;
  description: string | null;
  price_inr: number;
  price_usd: number;
  byod_required: boolean;
  limits: Record<string, number>;
  sort_order: number;
}

const DEFAULT_PLANS: SaasPlan[] = [
  {
    key: 'free', name: 'Free', description: 'BYOD only. Bring your own AI, GPU, CPU and storage keys.',
    price_inr: 0, price_usd: 0, byod_required: true,
    limits: { renders_per_month: 5, rpm: 10, rpd: 200, seats: 1, storage_gb: 2 }, sort_order: 0,
  },
  {
    key: 'creator', name: 'Creator', description: 'BYOD with higher limits and publishing channels.',
    price_inr: 999, price_usd: 12, byod_required: true,
    limits: { renders_per_month: 50, rpm: 30, rpd: 2000, seats: 2, storage_gb: 20 }, sort_order: 1,
  },
  {
    key: 'studio', name: 'Studio', description: 'Team workspace, priority queues and analytics.',
    price_inr: 2999, price_usd: 36, byod_required: true,
    limits: { renders_per_month: 300, rpm: 60, rpd: 10000, seats: 10, storage_gb: 100 }, sort_order: 2,
  },
  {
    key: 'managed', name: 'Managed', description: 'Platform-managed AI and GPU. No BYOD setup required.',
    price_inr: 9999, price_usd: 120, byod_required: false,
    limits: { renders_per_month: 500, rpm: 120, rpd: 20000, seats: 5, storage_gb: 250 }, sort_order: 3,
  },
];

function toPlan(row: Record<string, unknown>): SaasPlan {
  const limits = (row.limits && typeof row.limits === 'object') ? row.limits as Record<string, number> : {};
  return {
    key: String(row.key || ''),
    name: String(row.name || row.key || ''),
    description: typeof row.description === 'string' ? row.description : null,
    price_inr: Number(row.price_inr) || 0,
    price_usd: Number(row.price_usd) || 0,
    byod_required: row.byod_required !== false,
    limits,
    sort_order: Number(row.sort_order) || 0,
  };
}

export async function listPlans(): Promise<SaasPlan[]> {
  try {
    const { data } = await animeSupabase
      .from('saas_plans')
      .select('*')
      .eq('enabled', true)
      .order('sort_order');
    if (Array.isArray(data) && data.length > 0) {
      return data.map((row) => toPlan(row as Record<string, unknown>));
    }
  } catch {
    /* fall back to bundled plans */
  }
  return DEFAULT_PLANS;
}

export interface SubscriptionView {
  plan_key: string;
  plan_name: string;
  status: string;
  provider: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  limits: Record<string, number>;
  byod_required: boolean;
}

export async function getSubscription(userId: string): Promise<SubscriptionView> {
  const plans = await listPlans();
  const fallback = plans.find((plan) => plan.key === 'free') || DEFAULT_PLANS[0];
  try {
    const { data } = await animeSupabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    const row = data as Record<string, unknown> | null;
    if (row) {
      const plan = plans.find((item) => item.key === String(row.plan_key)) || fallback;
      return {
        plan_key: plan.key,
        plan_name: plan.name,
        status: String(row.status || 'active'),
        provider: typeof row.provider === 'string' ? row.provider : null,
        current_period_end: typeof row.current_period_end === 'string' ? row.current_period_end : null,
        cancel_at_period_end: row.cancel_at_period_end === true,
        limits: plan.limits,
        byod_required: plan.byod_required,
      };
    }
  } catch {
    /* table may not exist yet */
  }
  return {
    plan_key: fallback.key,
    plan_name: fallback.name,
    status: 'active',
    provider: null,
    current_period_end: null,
    cancel_at_period_end: false,
    limits: fallback.limits,
    byod_required: fallback.byod_required,
  };
}

export interface UsageSummary {
  window_days: number;
  renders: number;
  commands: number;
  ai_tokens: number;
  estimated_cost_usd: number;
  limit: number | null;
  remaining: number | null;
}

export async function getUsageSummary(userId: string, days = 30): Promise<UsageSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let rows: Array<Record<string, unknown>> = [];
  try {
    const { data } = await animeSupabase
      .from('usage_ledger')
      .select('kind, quantity, unit_cost')
      .eq('user_id', userId)
      .gte('occurred_at', since)
      .limit(5000);
    if (Array.isArray(data)) rows = data as Array<Record<string, unknown>>;
  } catch {
    rows = [];
  }

  const sums: Record<string, number> = { render: 0, command: 0, ai_token: 0 };
  let cost = 0;
  for (const row of rows) {
    const kind = String(row.kind || '');
    const quantity = Number(row.quantity) || 0;
    const unitCost = Number(row.unit_cost) || 0;
    if (kind in sums) sums[kind] += quantity;
    cost += quantity * unitCost;
  }

  const subscription = await getSubscription(userId);
  const limit = Number(subscription.limits.renders_per_month);
  const renders = sums.render;
  return {
    window_days: days,
    renders,
    commands: sums.command,
    ai_tokens: sums.ai_token,
    estimated_cost_usd: Number(cost.toFixed(4)),
    limit: Number.isFinite(limit) ? limit : null,
    remaining: Number.isFinite(limit) ? Math.max(0, limit - renders) : null,
  };
}

export async function getOnboarding(userId: string): Promise<Record<string, unknown>> {
  try {
    const { data } = await animeSupabase
      .from('onboarding_state')
      .select('steps, completed_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (data) return data as Record<string, unknown>;
  } catch {
    /* table may not exist yet */
  }
  return { steps: {}, completed_at: null };
}

export async function saveOnboarding(userId: string, steps: Record<string, unknown>): Promise<Record<string, unknown>> {
  const payload = {
    user_id: userId,
    steps,
    completed_at: steps.completed === true ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  try {
    await animeSupabase.from('onboarding_state').upsert(payload, { onConflict: 'user_id' });
  } catch {
    /* best effort */
  }
  return payload;
}

export async function assignPlan(userId: string, planKey: string, provider = 'manual'): Promise<SubscriptionView | null> {
  const plans = await listPlans();
  const plan = plans.find((item) => item.key === planKey);
  if (!plan) return null;
  try {
    await animeSupabase.from('subscriptions').upsert({
      user_id: userId,
      plan_key: plan.key,
      status: 'active',
      provider,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch {
    return null;
  }
  return getSubscription(userId);
}
