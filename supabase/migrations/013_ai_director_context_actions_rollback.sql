-- Rollback for 013_ai_director_context_actions.sql
DROP POLICY IF EXISTS director_messages_owner_delete ON public.director_messages;
DROP POLICY IF EXISTS director_messages_owner_insert ON public.director_messages;
DROP POLICY IF EXISTS director_messages_owner_select ON public.director_messages;
DROP POLICY IF EXISTS director_conversations_owner_update ON public.director_conversations;
DROP POLICY IF EXISTS director_conversations_owner_insert ON public.director_conversations;
DROP POLICY IF EXISTS director_conversations_owner_select ON public.director_conversations;

DROP TABLE IF EXISTS public.director_messages;
DROP TABLE IF EXISTS public.director_conversations;

DROP INDEX IF EXISTS public.director_messages_conversation_idx;
DROP INDEX IF EXISTS public.director_conversations_user_project_idx;

-- clips.duration_sec predates this migration and is intentionally preserved.
ALTER TABLE public.episodes DROP COLUMN IF EXISTS target_duration_sec;
