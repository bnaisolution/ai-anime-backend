-- Rollback for Batch 4 tenant/platform migration.
-- Additive columns and tables are removed. Existing tenant assignments are not data-destructive
-- because the owning user_id remains on projects/documents/quota rows.

DROP INDEX IF EXISTS public.idx_user_infrastructure_tenant;
DROP INDEX IF EXISTS public.idx_quota_usage_tenant;
DROP INDEX IF EXISTS public.idx_documents_project;
DROP INDEX IF EXISTS public.idx_documents_tenant;
DROP INDEX IF EXISTS public.idx_projects_tenant;

ALTER TABLE public.user_infrastructure DROP COLUMN IF EXISTS fingerprint;
ALTER TABLE public.user_infrastructure DROP COLUMN IF EXISTS revoked_at;
ALTER TABLE public.user_infrastructure DROP COLUMN IF EXISTS last_rotated_at;
ALTER TABLE public.user_infrastructure DROP COLUMN IF EXISTS bound_tenant_id;
ALTER TABLE public.user_infrastructure DROP COLUMN IF EXISTS key_version;

ALTER TABLE public.quota_usage DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.documents DROP COLUMN IF EXISTS project_id;
ALTER TABLE public.documents DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.projects DROP COLUMN IF EXISTS tenant_id;

DROP POLICY IF EXISTS "service role full access anime platform settings" ON public.anime_platform_settings;
DROP POLICY IF EXISTS "service role full access anime tenant members" ON public.anime_tenant_members;
DROP POLICY IF EXISTS "service role full access anime tenants" ON public.anime_tenants;
DROP TABLE IF EXISTS public.anime_platform_settings;
DROP TABLE IF EXISTS public.anime_tenant_members;
DROP TABLE IF EXISTS public.anime_tenants;
