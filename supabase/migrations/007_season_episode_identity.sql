-- Season-aware episode identity.
-- Allows S1E1 and S2E1 to coexist while preserving legacy season-1 rows.

ALTER TABLE public.episodes
    ADD COLUMN IF NOT EXISTS season_no integer DEFAULT 1;
UPDATE public.episodes SET season_no = 1 WHERE season_no IS NULL;
ALTER TABLE public.episodes ALTER COLUMN season_no SET DEFAULT 1;
ALTER TABLE public.episodes ALTER COLUMN season_no SET NOT NULL;

ALTER TABLE public.episode_states
    ADD COLUMN IF NOT EXISTS season_no integer NOT NULL DEFAULT 1;
ALTER TABLE public.scenes
    ADD COLUMN IF NOT EXISTS season_no integer NOT NULL DEFAULT 1;
ALTER TABLE public.clips
    ADD COLUMN IF NOT EXISTS season_no integer NOT NULL DEFAULT 1;

ALTER TABLE public.episodes DROP CONSTRAINT IF EXISTS episodes_project_ep_uniq;
ALTER TABLE public.episodes DROP CONSTRAINT IF EXISTS episodes_project_ep_unique;
ALTER TABLE public.episode_states DROP CONSTRAINT IF EXISTS episode_states_project_ep_unique;
ALTER TABLE public.episode_states DROP CONSTRAINT IF EXISTS episode_states_project_id_episode_no_key;
ALTER TABLE public.scenes DROP CONSTRAINT IF EXISTS uq_scenes_proj_ep_scene;
ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS clips_project_ep_scene_uniq;
ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS clips_project_ep_scene_unique;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'episodes_project_season_ep_uniq'
          AND conrelid = 'public.episodes'::regclass
    ) THEN
        ALTER TABLE public.episodes
            ADD CONSTRAINT episodes_project_season_ep_uniq
            UNIQUE (project_id, season_no, episode_no);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'episode_states_project_season_ep_uniq'
          AND conrelid = 'public.episode_states'::regclass
    ) THEN
        ALTER TABLE public.episode_states
            ADD CONSTRAINT episode_states_project_season_ep_uniq
            UNIQUE (project_id, season_no, episode_no);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'scenes_project_season_ep_scene_uniq'
          AND conrelid = 'public.scenes'::regclass
    ) THEN
        ALTER TABLE public.scenes
            ADD CONSTRAINT scenes_project_season_ep_scene_uniq
            UNIQUE (project_id, season_no, episode_no, scene_order);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'clips_project_season_ep_scene_uniq'
          AND conrelid = 'public.clips'::regclass
    ) THEN
        ALTER TABLE public.clips
            ADD CONSTRAINT clips_project_season_ep_scene_uniq
            UNIQUE (project_id, season_no, episode_no, scene_order);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_episodes_project_season_ep
    ON public.episodes (project_id, season_no, episode_no);
CREATE INDEX IF NOT EXISTS idx_episode_states_project_season_ep
    ON public.episode_states (project_id, season_no, episode_no);
CREATE INDEX IF NOT EXISTS idx_scenes_project_season_ep_order
    ON public.scenes (project_id, season_no, episode_no, scene_order);
CREATE INDEX IF NOT EXISTS idx_clips_project_season_ep_order
    ON public.clips (project_id, season_no, episode_no, scene_order);
