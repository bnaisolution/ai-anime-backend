DO $$
BEGIN
  -- 1. character_status (project_id, character_code)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'character_status') THEN
    DELETE FROM public.character_status a USING public.character_status b
    WHERE a.id < b.id AND a.project_id = b.project_id AND a.character_code = b.character_code;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_character_status_proj_code ON public.character_status (project_id, character_code);
  END IF;

  -- 2. characters (project_id, character_code)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'characters') THEN
    DELETE FROM public.characters a USING public.characters b
    WHERE a.id < b.id AND a.project_id = b.project_id AND a.character_code = b.character_code;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_characters_proj_code ON public.characters (project_id, character_code);
  END IF;

  -- 3. episodes (project_id, episode_no)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'episodes') THEN
    DELETE FROM public.episodes a USING public.episodes b
    WHERE a.id < b.id AND a.project_id = b.project_id AND a.episode_no = b.episode_no;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_episodes_proj_epno ON public.episodes (project_id, episode_no);
  END IF;

  -- 4. clips (project_id, episode_no, scene_order)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clips' AND column_name = 'scene_order'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_clips_proj_ep_scene ON public.clips (project_id, episode_no, scene_order);
  END IF;

  -- 5. artifacts (project_id, artifact_code)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'artifacts' AND column_name = 'artifact_code'
  ) THEN
    DELETE FROM public.artifacts a USING public.artifacts b
    WHERE a.id < b.id AND a.project_id = b.project_id AND a.artifact_code = b.artifact_code;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_artifacts_proj_code ON public.artifacts (project_id, artifact_code);
  END IF;

  -- 6. story_rules (project_id, rule_code)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'story_rules' AND column_name = 'rule_code'
  ) THEN
    DELETE FROM public.story_rules a USING public.story_rules b
    WHERE a.id < b.id AND a.project_id = b.project_id AND a.rule_code = b.rule_code;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_story_rules_proj_code ON public.story_rules (project_id, rule_code);
  END IF;
END $$;
