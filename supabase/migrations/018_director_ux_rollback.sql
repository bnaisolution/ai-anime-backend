-- Rollback for 018_director_ux.sql
DROP POLICY IF EXISTS director_message_attachments_owner_delete ON public.director_message_attachments;
DROP POLICY IF EXISTS director_message_attachments_owner_insert ON public.director_message_attachments;
DROP POLICY IF EXISTS director_message_attachments_owner_select ON public.director_message_attachments;
DROP TABLE IF EXISTS public.director_message_attachments;

DROP POLICY IF EXISTS director_action_audit_owner_insert ON public.director_action_audit;
DROP POLICY IF EXISTS director_action_audit_owner_select ON public.director_action_audit;
DROP TABLE IF EXISTS public.director_action_audit;

ALTER TABLE public.director_conversations
  DROP COLUMN IF EXISTS summary_message_count;
ALTER TABLE public.director_conversations
  DROP COLUMN IF EXISTS summary_updated_at;
