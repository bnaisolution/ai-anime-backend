-- AI Director: persistent conversation history, canonical duration snapshot, runtime measurement.
-- Additive only. Existing workflows remain unchanged.

ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS target_duration_sec integer;

ALTER TABLE public.clips
  ADD COLUMN IF NOT EXISTS duration_sec numeric(10,3);

CREATE TABLE IF NOT EXISTS public.director_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.director_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.director_conversations(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS director_conversations_user_project_idx
  ON public.director_conversations (user_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS director_messages_conversation_idx
  ON public.director_messages (conversation_id, created_at DESC);

ALTER TABLE public.director_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.director_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS director_conversations_owner_select ON public.director_conversations;
CREATE POLICY director_conversations_owner_select ON public.director_conversations
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS director_conversations_owner_insert ON public.director_conversations;
CREATE POLICY director_conversations_owner_insert ON public.director_conversations
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS director_conversations_owner_update ON public.director_conversations;
CREATE POLICY director_conversations_owner_update ON public.director_conversations
  FOR UPDATE USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS director_messages_owner_select ON public.director_messages;
CREATE POLICY director_messages_owner_select ON public.director_messages
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS director_messages_owner_insert ON public.director_messages;
CREATE POLICY director_messages_owner_insert ON public.director_messages
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS director_messages_owner_delete ON public.director_messages;
CREATE POLICY director_messages_owner_delete ON public.director_messages
  FOR DELETE USING (auth.uid()::text = user_id);
