-- Batch 2: Master Prompt Library, prompt versioning, project associations, and
-- honest memory embeddings. This migration is additive and is safe to replay.

ALTER TABLE public.user_system_prompts
    ADD COLUMN IF NOT EXISTS prompt_category text DEFAULT 'BIBLE'::text NOT NULL,
    ADD COLUMN IF NOT EXISTS genre text,
    ADD COLUMN IF NOT EXISTS format text,
    ADD COLUMN IF NOT EXISTS model_hint text,
    ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[] NOT NULL,
    ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false NOT NULL,
    ADD COLUMN IF NOT EXISTS version integer DEFAULT 1 NOT NULL,
    ADD COLUMN IF NOT EXISTS parent_prompt_id uuid,
    ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_system_prompts_parent_prompt_id_fkey'
          AND conrelid = 'public.user_system_prompts'::regclass
    ) THEN
        ALTER TABLE public.user_system_prompts
            ADD CONSTRAINT user_system_prompts_parent_prompt_id_fkey
            FOREIGN KEY (parent_prompt_id) REFERENCES public.user_system_prompts(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.prompt_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prompt_id uuid NOT NULL,
    user_id uuid NOT NULL,
    version integer NOT NULL,
    title text NOT NULL,
    visual_medium text NOT NULL,
    prompt_category text NOT NULL,
    genre text,
    format text,
    model_hint text,
    prompt_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prompt_versions_pkey PRIMARY KEY (id),
    CONSTRAINT prompt_versions_prompt_id_fkey FOREIGN KEY (prompt_id) REFERENCES public.user_system_prompts(id) ON DELETE CASCADE,
    CONSTRAINT prompt_versions_prompt_version_key UNIQUE (prompt_id, version)
);

CREATE TABLE IF NOT EXISTS public.project_prompt_associations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    prompt_id uuid NOT NULL,
    user_id uuid NOT NULL,
    surface text DEFAULT 'LIBRARY'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_prompt_associations_pkey PRIMARY KEY (id),
    CONSTRAINT project_prompt_associations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
    CONSTRAINT project_prompt_associations_prompt_id_fkey FOREIGN KEY (prompt_id) REFERENCES public.user_system_prompts(id) ON DELETE CASCADE,
    CONSTRAINT project_prompt_associations_project_prompt_key UNIQUE (project_id, prompt_id)
);

ALTER TABLE public.memory_knowledge ALTER COLUMN embedding DROP NOT NULL;

CREATE INDEX IF NOT EXISTS user_system_prompts_user_category_idx
    ON public.user_system_prompts(user_id, prompt_category, created_at DESC);
CREATE INDEX IF NOT EXISTS user_system_prompts_user_favorite_idx
    ON public.user_system_prompts(user_id, is_favorite);
CREATE INDEX IF NOT EXISTS prompt_versions_prompt_id_idx
    ON public.prompt_versions(prompt_id, version DESC);
CREATE INDEX IF NOT EXISTS project_prompt_associations_project_id_idx
    ON public.project_prompt_associations(project_id);
CREATE INDEX IF NOT EXISTS project_prompt_associations_prompt_id_idx
    ON public.project_prompt_associations(prompt_id);
CREATE INDEX IF NOT EXISTS memory_knowledge_project_created_idx
    ON public.memory_knowledge(project_id, created_at DESC);

ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_prompt_associations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role full access on prompt_versions" ON public.prompt_versions;
CREATE POLICY "Allow service role full access on prompt_versions"
    ON public.prompt_versions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role full access on project_prompt_associations" ON public.project_prompt_associations;
CREATE POLICY "Allow service role full access on project_prompt_associations"
    ON public.project_prompt_associations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.snapshot_prompt_version() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.title IS DISTINCT FROM NEW.title
    OR OLD.prompt_text IS DISTINCT FROM NEW.prompt_text
    OR OLD.prompt_category IS DISTINCT FROM NEW.prompt_category
    OR OLD.genre IS DISTINCT FROM NEW.genre
    OR OLD.format IS DISTINCT FROM NEW.format
    OR OLD.model_hint IS DISTINCT FROM NEW.model_hint
  ) THEN
    INSERT INTO public.prompt_versions (
      prompt_id, user_id, version, title, visual_medium, prompt_category,
      genre, format, model_hint, prompt_text
    ) VALUES (
      OLD.id, OLD.user_id, OLD.version, OLD.title, OLD.visual_medium,
      OLD.prompt_category, OLD.genre, OLD.format, OLD.model_hint, OLD.prompt_text
    )
    ON CONFLICT (prompt_id, version) DO NOTHING;
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_system_prompts_snapshot_version ON public.user_system_prompts;
CREATE TRIGGER user_system_prompts_snapshot_version
    BEFORE UPDATE ON public.user_system_prompts
    FOR EACH ROW
    EXECUTE FUNCTION public.snapshot_prompt_version();
