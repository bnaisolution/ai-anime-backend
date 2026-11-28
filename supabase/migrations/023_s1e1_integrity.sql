BEGIN;

ALTER TABLE public.episodes ADD COLUMN IF NOT EXISTS beat_count integer DEFAULT 0;
ALTER TABLE public.episodes ADD COLUMN IF NOT EXISTS target_duration_sec integer;
ALTER TABLE public.episodes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.episode_states ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS episodes_project_season_ep_uidx
  ON public.episodes (project_id, season_no, episode_no);
CREATE UNIQUE INDEX IF NOT EXISTS episode_states_project_season_ep_uidx
  ON public.episode_states (project_id, season_no, episode_no);
CREATE UNIQUE INDEX IF NOT EXISTS scenes_project_season_ep_scene_uidx
  ON public.scenes (project_id, season_no, episode_no, scene_order);
CREATE UNIQUE INDEX IF NOT EXISTS clips_project_season_ep_scene_uidx
  ON public.clips (project_id, season_no, episode_no, scene_order);

COMMIT;
