-- Rollback is lossy if prompts use a medium outside the legacy pair.
ALTER TABLE public.user_system_prompts
    DROP CONSTRAINT IF EXISTS user_system_prompts_visual_medium_check;

ALTER TABLE public.user_system_prompts
    ADD CONSTRAINT user_system_prompts_visual_medium_check
    CHECK (visual_medium IN ('ANIME', 'REAL_HUMAN'));
