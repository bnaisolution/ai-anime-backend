BEGIN;

DROP INDEX IF EXISTS public.episodes_project_season_ep_uidx;
DROP INDEX IF EXISTS public.episode_states_project_season_ep_uidx;
DROP INDEX IF EXISTS public.scenes_project_season_ep_scene_uidx;
DROP INDEX IF EXISTS public.clips_project_season_ep_scene_uidx;

ALTER TABLE public.episode_states DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.episodes DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.episodes DROP COLUMN IF EXISTS target_duration_sec;
ALTER TABLE public.episodes DROP COLUMN IF EXISTS beat_count;

COMMIT;
