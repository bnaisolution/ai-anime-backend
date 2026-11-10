DROP TRIGGER IF EXISTS user_system_prompts_snapshot_version ON public.user_system_prompts;
DROP FUNCTION IF EXISTS public.snapshot_prompt_version();

DROP POLICY IF EXISTS "Allow service role full access on project_prompt_associations" ON public.project_prompt_associations;
DROP POLICY IF EXISTS "Allow service role full access on prompt_versions" ON public.prompt_versions;

DROP INDEX IF EXISTS public.memory_knowledge_project_created_idx;
DROP INDEX IF EXISTS public.project_prompt_associations_prompt_id_idx;
DROP INDEX IF EXISTS public.project_prompt_associations_project_id_idx;
DROP INDEX IF EXISTS public.prompt_versions_prompt_id_idx;
DROP INDEX IF EXISTS public.user_system_prompts_user_favorite_idx;
DROP INDEX IF EXISTS public.user_system_prompts_user_category_idx;

DROP TABLE IF EXISTS public.project_prompt_associations;
DROP TABLE IF EXISTS public.prompt_versions;

ALTER TABLE public.memory_knowledge ALTER COLUMN embedding SET NOT NULL;

ALTER TABLE public.user_system_prompts DROP CONSTRAINT IF EXISTS user_system_prompts_parent_prompt_id_fkey;
ALTER TABLE public.user_system_prompts
    DROP COLUMN IF EXISTS is_archived,
    DROP COLUMN IF EXISTS parent_prompt_id,
    DROP COLUMN IF EXISTS version,
    DROP COLUMN IF EXISTS is_favorite,
    DROP COLUMN IF EXISTS tags,
    DROP COLUMN IF EXISTS model_hint,
    DROP COLUMN IF EXISTS format,
    DROP COLUMN IF EXISTS genre,
    DROP COLUMN IF EXISTS prompt_category;
