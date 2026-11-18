-- Publishing channel OAuth storage (YouTube / Instagram).
-- Additive only; tokens are stored encrypted with the infrastructure key registry.

CREATE TABLE IF NOT EXISTS public.publish_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('youtube', 'instagram')),
  account_ref text,
  channel_name text,
  external_id text,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'revoked', 'expired')),
  encrypted_tokens text NOT NULL DEFAULT '',
  key_version integer NOT NULL DEFAULT 1,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS publish_channels_user_platform_key
  ON public.publish_channels (user_id, platform);

CREATE TABLE IF NOT EXISTS public.publish_oauth_states (
  state text PRIMARY KEY,
  user_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('youtube', 'instagram')),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS publish_oauth_states_expiry_idx
  ON public.publish_oauth_states (expires_at);

ALTER TABLE public.publish_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publish_oauth_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS publish_channels_owner_select ON public.publish_channels;
CREATE POLICY publish_channels_owner_select ON public.publish_channels
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS publish_channels_owner_update ON public.publish_channels;
CREATE POLICY publish_channels_owner_update ON public.publish_channels
  FOR UPDATE USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS publish_oauth_states_owner_select ON public.publish_oauth_states;
CREATE POLICY publish_oauth_states_owner_select ON public.publish_oauth_states
  FOR SELECT USING (auth.uid()::text = user_id);

REVOKE ALL ON public.publish_channels FROM anon;
REVOKE ALL ON public.publish_oauth_states FROM anon;
GRANT SELECT, UPDATE ON public.publish_channels TO authenticated;
GRANT SELECT ON public.publish_oauth_states TO authenticated;
