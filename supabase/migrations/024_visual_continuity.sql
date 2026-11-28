BEGIN;

ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS shot_manifest jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS camera_json jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS continuity_json jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS keyframe_url text;

ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS shot_manifest jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS camera_json jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS continuity_json jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS keyframe_url text;

ALTER TABLE public.episodes ADD COLUMN IF NOT EXISTS artifact_manifest jsonb DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'anime_data') THEN
    ALTER TABLE anime_data.scenes ADD COLUMN IF NOT EXISTS shot_manifest jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE anime_data.scenes ADD COLUMN IF NOT EXISTS camera_json jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE anime_data.scenes ADD COLUMN IF NOT EXISTS continuity_json jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE anime_data.scenes ADD COLUMN IF NOT EXISTS keyframe_url text;
    ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS shot_manifest jsonb DEFAULT '[]'::jsonb;
    ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS camera_json jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS continuity_json jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS keyframe_url text;
    ALTER TABLE anime_data.episodes ADD COLUMN IF NOT EXISTS artifact_manifest jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

COMMIT;
