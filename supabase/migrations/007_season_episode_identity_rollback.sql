-- Rollback is lossy if multiple seasons currently reuse the same episode_no.
ALTER TABLE public.episodes DROP CONSTRAINT IF EXISTS episodes_project_season_ep_uniq;
ALTER TABLE public.episode_states DROP CONSTRAINT IF EXISTS episode_states_project_season_ep_uniq;
ALTER TABLE public.scenes DROP CONSTRAINT IF EXISTS scenes_project_season_ep_scene_uniq;
ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS clips_project_season_ep_scene_uniq;

ALTER TABLE public.episodes
    ADD CONSTRAINT episodes_project_ep_uniq UNIQUE (project_id, episode_no);
ALTER TABLE public.episode_states
    ADD CONSTRAINT episode_states_project_ep_unique UNIQUE (project_id, episode_no);
ALTER TABLE public.scenes
    ADD CONSTRAINT uq_scenes_proj_ep_scene UNIQUE (project_id, episode_no, scene_order);
ALTER TABLE public.clips
    ADD CONSTRAINT clips_project_ep_scene_uniq UNIQUE (project_id, episode_no, scene_order);
CREATE UNIQUE INDEX IF NOT EXISTS uq_episodes_proj_epno ON public.episodes (project_id, episode_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clips_proj_ep_scene ON public.clips (project_id, episode_no, scene_order);

DROP INDEX IF EXISTS public.idx_episodes_project_season_ep;
DROP INDEX IF EXISTS public.idx_episode_states_project_season_ep;
DROP INDEX IF EXISTS public.idx_scenes_project_season_ep_order;
DROP INDEX IF EXISTS public.idx_clips_project_season_ep_order;

ALTER TABLE public.episodes DROP COLUMN IF EXISTS season_no;
ALTER TABLE public.episode_states DROP COLUMN IF EXISTS season_no;
ALTER TABLE public.scenes DROP COLUMN IF EXISTS season_no;
ALTER TABLE public.clips DROP COLUMN IF EXISTS season_no;
