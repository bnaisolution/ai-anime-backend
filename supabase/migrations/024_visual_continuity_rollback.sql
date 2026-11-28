BEGIN;

ALTER TABLE public.episodes DROP COLUMN IF EXISTS artifact_manifest;
ALTER TABLE public.clips DROP COLUMN IF EXISTS scene_state_json;
ALTER TABLE public.clips DROP COLUMN IF EXISTS keyframe_url;
ALTER TABLE public.clips DROP COLUMN IF EXISTS continuity_json;
ALTER TABLE public.clips DROP COLUMN IF EXISTS camera_json;
ALTER TABLE public.clips DROP COLUMN IF EXISTS shot_manifest;
ALTER TABLE public.scenes DROP COLUMN IF EXISTS scene_state_json;
ALTER TABLE public.scenes DROP COLUMN IF EXISTS keyframe_url;
ALTER TABLE public.scenes DROP COLUMN IF EXISTS continuity_json;
ALTER TABLE public.scenes DROP COLUMN IF EXISTS camera_json;
ALTER TABLE public.scenes DROP COLUMN IF EXISTS shot_manifest;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'anime_data') THEN
    ALTER TABLE anime_data.episodes DROP COLUMN IF EXISTS artifact_manifest;
    ALTER TABLE anime_data.clips DROP COLUMN IF EXISTS scene_state_json;
    ALTER TABLE anime_data.clips DROP COLUMN IF EXISTS keyframe_url;
    ALTER TABLE anime_data.clips DROP COLUMN IF EXISTS continuity_json;
    ALTER TABLE anime_data.clips DROP COLUMN IF EXISTS camera_json;
    ALTER TABLE anime_data.clips DROP COLUMN IF EXISTS shot_manifest;
    ALTER TABLE anime_data.scenes DROP COLUMN IF EXISTS scene_state_json;
    ALTER TABLE anime_data.scenes DROP COLUMN IF EXISTS keyframe_url;
    ALTER TABLE anime_data.scenes DROP COLUMN IF EXISTS continuity_json;
    ALTER TABLE anime_data.scenes DROP COLUMN IF EXISTS camera_json;
    ALTER TABLE anime_data.scenes DROP COLUMN IF EXISTS shot_manifest;
  END IF;
END $$;

COMMIT;
