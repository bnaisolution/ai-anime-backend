-- Resource readiness snapshots for AI Director setup guidance.
-- Additive only; the readiness resolver can run without this table.

CREATE TABLE IF NOT EXISTS public.resource_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  resource_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('ready', 'degraded', 'missing')),
  mode text,
  latency_ms integer,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resource_health_checks_lookup_idx
  ON public.resource_health_checks (user_id, project_id, resource_key, checked_at DESC);

ALTER TABLE public.resource_health_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resource_health_checks_owner_select ON public.resource_health_checks;
CREATE POLICY resource_health_checks_owner_select ON public.resource_health_checks
  FOR SELECT USING (auth.uid()::text = user_id);

REVOKE ALL ON public.resource_health_checks FROM anon;
GRANT SELECT ON public.resource_health_checks TO authenticated;
