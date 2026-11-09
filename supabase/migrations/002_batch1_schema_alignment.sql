CREATE TABLE IF NOT EXISTS public.user_system_prompts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid,
    title text NOT NULL,
    visual_medium text DEFAULT 'ANIME'::text NOT NULL,
    prompt_text text NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_system_prompts_pkey PRIMARY KEY (id),
    CONSTRAINT user_system_prompts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS visual_medium text DEFAULT 'ANIME'::text,
    ADD COLUMN IF NOT EXISTS active_system_prompt_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'projects_active_system_prompt_id_fkey'
          AND conrelid = 'public.projects'::regclass
    ) THEN
        ALTER TABLE public.projects
            ADD CONSTRAINT projects_active_system_prompt_id_fkey
            FOREIGN KEY (active_system_prompt_id) REFERENCES public.user_system_prompts(id);
    END IF;
END $$;

ALTER TABLE public.episodes
    ADD COLUMN IF NOT EXISTS synopsis text,
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

ALTER TABLE public.clips
    ADD COLUMN IF NOT EXISTS tg_image_file_id text,
    ADD COLUMN IF NOT EXISTS tg_audio_file_id text,
    ADD COLUMN IF NOT EXISTS tg_video_file_id text,
    ADD COLUMN IF NOT EXISTS clip_url text,
    ADD COLUMN IF NOT EXISTS provider text,
    ADD COLUMN IF NOT EXISTS duration_sec numeric;

ALTER TABLE public.outbox_events
    ADD COLUMN IF NOT EXISTS processing_started_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS user_system_prompts_user_id_idx ON public.user_system_prompts(user_id);
CREATE INDEX IF NOT EXISTS user_system_prompts_project_id_idx ON public.user_system_prompts(project_id);
CREATE INDEX IF NOT EXISTS outbox_events_processing_started_at_idx ON public.outbox_events(processing_started_at);

ALTER TABLE public.user_system_prompts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'user_system_prompts'
          AND policyname = 'Allow service role full access on user_system_prompts'
    ) THEN
        CREATE POLICY "Allow service role full access on user_system_prompts"
            ON public.user_system_prompts
            FOR ALL
            USING (true);
    END IF;
END $$;

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
    LIMIT GREATEST(1, LEAST(p_batch_size, 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox_events target
  SET
    status = 'processing',
    attempts = target.attempts + 1,
    processing_started_at = now()
  FROM claimed
  WHERE target.id = claimed.id
  RETURNING target.*;
END;
$$;
