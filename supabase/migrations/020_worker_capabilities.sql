-- Worker capability registry for GPU/CPU workers.
-- Additive only; used to validate a render profile before dispatch.

CREATE TABLE IF NOT EXISTS public.worker_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id text NOT NULL,
  worker_type text NOT NULL CHECK (worker_type IN ('gpu', 'cpu', 'hybrid')),
  user_id text,
  models text[] NOT NULL DEFAULT '{}'::text[],
  profiles text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('ready', 'busy', 'unknown', 'offline')),
  vram_gb integer,
  last_seen timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS worker_capabilities_worker_key
  ON public.worker_capabilities (worker_id);

CREATE INDEX IF NOT EXISTS worker_capabilities_user_idx
  ON public.worker_capabilities (user_id, worker_type, status);

ALTER TABLE public.worker_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worker_capabilities_owner_select ON public.worker_capabilities;
CREATE POLICY worker_capabilities_owner_select ON public.worker_capabilities
  FOR SELECT USING (user_id IS NOT NULL AND auth.uid()::text = user_id);

REVOKE ALL ON public.worker_capabilities FROM anon;
GRANT SELECT ON public.worker_capabilities TO authenticated;
