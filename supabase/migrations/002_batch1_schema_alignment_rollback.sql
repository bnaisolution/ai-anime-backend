ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_active_system_prompt_id_fkey;

ALTER TABLE public.projects
    DROP COLUMN IF EXISTS visual_medium,
    DROP COLUMN IF EXISTS active_system_prompt_id;

ALTER TABLE public.episodes
    DROP COLUMN IF EXISTS synopsis,
    DROP COLUMN IF EXISTS updated_at;

ALTER TABLE public.clips
    DROP COLUMN IF EXISTS tg_image_file_id,
    DROP COLUMN IF EXISTS tg_audio_file_id,
    DROP COLUMN IF EXISTS tg_video_file_id,
    DROP COLUMN IF EXISTS clip_url,
    DROP COLUMN IF EXISTS provider,
    DROP COLUMN IF EXISTS duration_sec;

DROP INDEX IF EXISTS public.outbox_events_processing_started_at_idx;

ALTER TABLE public.outbox_events DROP COLUMN IF EXISTS processing_started_at;

DROP POLICY IF EXISTS "Allow service role full access on user_system_prompts" ON public.user_system_prompts;
DROP INDEX IF EXISTS public.user_system_prompts_project_id_idx;
DROP INDEX IF EXISTS public.user_system_prompts_user_id_idx;
DROP TABLE IF EXISTS public.user_system_prompts;

CREATE OR REPLACE FUNCTION public.claim_outbox_batch(p_type text, p_batch_size integer DEFAULT 10) RETURNS SETOF public.outbox_events
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT oe.id
    FROM public.outbox_events oe
    WHERE oe.status = 'pending'
      AND oe.next_attempt_at <= now()
      AND (
        oe.type = p_type
        OR (p_type = 'dispatch_n8n' AND oe.type LIKE 'ANIME_COMMAND_DISPATCH:%')
      )
    ORDER BY oe.next_attempt_at ASC, oe.created_at ASC
    LIMIT GREATEST(1, LEAST(p_batch_size, 100)))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox_events target
  SET
    status = 'processing',
    attempts = target.attempts + 1
  FROM claimed
  WHERE target.id = claimed.id
  RETURNING target.*;
END;
$$;
