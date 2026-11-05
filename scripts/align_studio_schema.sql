-- Safe additive schema alignment for AI Cinematic Anime Engine V2
ALTER TABLE IF EXISTS public.characters
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'SUPPORTING';

ALTER TABLE IF EXISTS public.user_system_prompts
  ADD COLUMN IF NOT EXISTS prompt_category text DEFAULT 'BIBLE';

ALTER TABLE IF EXISTS public.episodes
  ADD COLUMN IF NOT EXISTS prompt_id uuid NULL;

ALTER TABLE IF EXISTS public.story_state ENABLE ROW LEVEL SECURITY;
