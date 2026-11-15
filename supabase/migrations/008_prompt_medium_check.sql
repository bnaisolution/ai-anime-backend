-- Align the prompt library medium check with the creative registry.
ALTER TABLE public.user_system_prompts
    DROP CONSTRAINT IF EXISTS user_system_prompts_visual_medium_check;

ALTER TABLE public.user_system_prompts
    ADD CONSTRAINT user_system_prompts_visual_medium_check
    CHECK (visual_medium IN (
        'ANIME',
        'MANHWA',
        '3D',
        '2D_ANIMATION',
        'REAL_HUMAN',
        'LIVE_ACTION',
        'CINEMATIC',
        'HYBRID'
    ));
