-- 018_director_ux.sql
-- Director action audit, attachment metadata and conversation summary support.

ALTER TABLE public.director_conversations
  ADD COLUMN IF NOT EXISTS summary_updated_at timestamptz;
ALTER TABLE public.director_conversations
  ADD COLUMN IF NOT EXISTS summary_message_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.director_action_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  conversation_id uuid NULL,
  action_id text NOT NULL,
  intent text NOT NULL,
  risk text NOT NULL DEFAULT 'unknown',
  status text NOT NULL CHECK (status IN ('proposed', 'executed', 'failed', 'blocked')),
  command_id text NULL,
  request_id text NULL,
  reason text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS director_action_audit_user_created_idx
  ON public.director_action_audit (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS director_action_audit_project_created_idx
  ON public.director_action_audit (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS director_action_audit_action_idx
  ON public.director_action_audit (action_id);

ALTER TABLE public.director_action_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS director_action_audit_owner_select ON public.director_action_audit;
CREATE POLICY director_action_audit_owner_select ON public.director_action_audit
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS director_action_audit_owner_insert ON public.director_action_audit;
CREATE POLICY director_action_audit_owner_insert ON public.director_action_audit
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE TABLE IF NOT EXISTS public.director_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  conversation_id uuid NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image', 'file')),
  size_bytes integer NOT NULL,
  data_base64 text NULL,
  text_content text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS director_message_attachments_user_project_idx
  ON public.director_message_attachments (user_id, project_id, created_at DESC);

ALTER TABLE public.director_message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS director_message_attachments_owner_select ON public.director_message_attachments;
CREATE POLICY director_message_attachments_owner_select ON public.director_message_attachments
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS director_message_attachments_owner_insert ON public.director_message_attachments;
CREATE POLICY director_message_attachments_owner_insert ON public.director_message_attachments
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS director_message_attachments_owner_delete ON public.director_message_attachments;
CREATE POLICY director_message_attachments_owner_delete ON public.director_message_attachments
  FOR DELETE USING (auth.uid()::text = user_id);
