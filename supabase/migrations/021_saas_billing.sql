-- SaaS control plane: plans, subscriptions, usage ledger, onboarding state.
-- Additive only. Billing provider integration stays behind SAAS_BILLING.

CREATE TABLE IF NOT EXISTS public.saas_plans (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text,
  price_inr numeric(12,2) NOT NULL DEFAULT 0,
  price_usd numeric(12,2) NOT NULL DEFAULT 0,
  byod_required boolean NOT NULL DEFAULT true,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id text PRIMARY KEY,
  plan_key text NOT NULL REFERENCES public.saas_plans(key),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'paused')),
  provider text,
  provider_ref text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  kind text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'count',
  unit_cost numeric(12,4) NOT NULL DEFAULT 0,
  provider text,
  model text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_ledger_user_time_idx
  ON public.usage_ledger (user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.onboarding_state (
  user_id text PRIMARY KEY,
  steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  provider text NOT NULL,
  event_type text NOT NULL,
  amount numeric(12,2),
  currency text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saas_plans_read_all ON public.saas_plans;
CREATE POLICY saas_plans_read_all ON public.saas_plans FOR SELECT USING (true);

DROP POLICY IF EXISTS subscriptions_owner_select ON public.subscriptions;
CREATE POLICY subscriptions_owner_select ON public.subscriptions
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS usage_ledger_owner_select ON public.usage_ledger;
CREATE POLICY usage_ledger_owner_select ON public.usage_ledger
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS onboarding_state_owner_all ON public.onboarding_state;
CREATE POLICY onboarding_state_owner_all ON public.onboarding_state
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

REVOKE ALL ON public.saas_plans FROM anon;
REVOKE ALL ON public.subscriptions FROM anon;
REVOKE ALL ON public.usage_ledger FROM anon;
REVOKE ALL ON public.onboarding_state FROM anon;
REVOKE ALL ON public.billing_events FROM anon;
GRANT SELECT ON public.saas_plans TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT ON public.usage_ledger TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.onboarding_state TO authenticated;

INSERT INTO public.saas_plans (key, name, description, price_inr, price_usd, byod_required, limits, sort_order)
VALUES
  ('free', 'Free', 'BYOD only. Bring your own AI, GPU, CPU and storage keys.', 0, 0, true,
    '{"renders_per_month": 5, "rpm": 10, "rpd": 200, "seats": 1, "storage_gb": 2}'::jsonb, 0),
  ('creator', 'Creator', 'BYOD with higher limits and publishing channels.', 999, 12, true,
    '{"renders_per_month": 50, "rpm": 30, "rpd": 2000, "seats": 2, "storage_gb": 20}'::jsonb, 1),
  ('studio', 'Studio', 'Team workspace, priority queues and analytics.', 2999, 36, true,
    '{"renders_per_month": 300, "rpm": 60, "rpd": 10000, "seats": 10, "storage_gb": 100}'::jsonb, 2),
  ('managed', 'Managed', 'Platform-managed AI and GPU. No BYOD setup required.', 9999, 120, false,
    '{"renders_per_month": 500, "rpm": 120, "rpd": 20000, "seats": 5, "storage_gb": 250}'::jsonb, 3)
ON CONFLICT (key) DO NOTHING;
