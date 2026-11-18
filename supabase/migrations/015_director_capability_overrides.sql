-- AI Director capability override registry.
-- Additive only: the bundled manifest stays authoritative unless a row disables a capability.

CREATE TABLE IF NOT EXISTS public.director_capability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_key text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('global', 'tenant', 'user')),
  scope_id text,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS director_capability_overrides_scope_key
  ON public.director_capability_overrides (capability_key, scope, COALESCE(scope_id, '*'));

CREATE INDEX IF NOT EXISTS director_capability_overrides_lookup_idx
  ON public.director_capability_overrides (scope, scope_id, capability_key);

ALTER TABLE public.director_capability_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS director_capability_overrides_owner_select ON public.director_capability_overrides;
CREATE POLICY director_capability_overrides_owner_select ON public.director_capability_overrides
  FOR SELECT USING (scope = 'user' AND auth.uid()::text = scope_id);

DROP POLICY IF EXISTS director_capability_overrides_owner_insert ON public.director_capability_overrides;
CREATE POLICY director_capability_overrides_owner_insert ON public.director_capability_overrides
  FOR INSERT WITH CHECK (scope = 'user' AND auth.uid()::text = scope_id);

DROP POLICY IF EXISTS director_capability_overrides_owner_update ON public.director_capability_overrides;
CREATE POLICY director_capability_overrides_owner_update ON public.director_capability_overrides
  FOR UPDATE USING (scope = 'user' AND auth.uid()::text = scope_id);

REVOKE ALL ON public.director_capability_overrides FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.director_capability_overrides TO authenticated;
