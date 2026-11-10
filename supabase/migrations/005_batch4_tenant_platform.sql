-- Batch 4: tenant isolation, BYOI lifecycle metadata, and platform-managed controls.
-- Additive only. Existing single-owner projects are backfilled into a legacy tenant.

CREATE TABLE IF NOT EXISTS public.anime_tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'disabled')),
    plan text NOT NULL DEFAULT 'byod',
    is_platform_managed boolean NOT NULL DEFAULT false,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.anime_tenant_members (
    tenant_id uuid NOT NULL REFERENCES public.anime_tenants(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'editor', 'reviewer', 'viewer')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_anime_tenant_members_user
    ON public.anime_tenant_members (user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_tenant_members_default
    ON public.anime_tenant_members (user_id)
    WHERE is_default = true AND status = 'active';

CREATE TABLE IF NOT EXISTS public.anime_platform_settings (
    id text PRIMARY KEY DEFAULT 'default',
    platform_managed_enabled boolean NOT NULL DEFAULT false,
    billing_enabled boolean NOT NULL DEFAULT false,
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    reason text
);

INSERT INTO public.anime_platform_settings (id, platform_managed_enabled, billing_enabled, reason)
VALUES ('default', false, false, 'Platform-Managed hosting is disabled until explicitly approved by the Owner.')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.anime_tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.anime_tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.quota_usage
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.anime_tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_projects_tenant ON public.projects (tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant ON public.documents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_project ON public.documents (project_id);
CREATE INDEX IF NOT EXISTS idx_quota_usage_tenant ON public.quota_usage (tenant_id);

ALTER TABLE public.user_infrastructure
    ADD COLUMN IF NOT EXISTS key_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.user_infrastructure
    ADD COLUMN IF NOT EXISTS bound_tenant_id uuid REFERENCES public.anime_tenants(id) ON DELETE SET NULL;
ALTER TABLE public.user_infrastructure
    ADD COLUMN IF NOT EXISTS last_rotated_at timestamptz;
ALTER TABLE public.user_infrastructure
    ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE public.user_infrastructure
    ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE INDEX IF NOT EXISTS idx_user_infrastructure_tenant
    ON public.user_infrastructure (bound_tenant_id);

-- Backfill one legacy tenant per existing project owner. This is idempotent.
INSERT INTO public.anime_tenants (name, slug, created_by, plan)
SELECT
    'Legacy Workspace ' || left(p.user_id, 8),
    'legacy-' || md5(p.user_id),
    p.user_id,
    'byod'
FROM public.projects p
WHERE p.user_id IS NOT NULL
  AND p.tenant_id IS NULL
GROUP BY p.user_id
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.anime_tenant_members (tenant_id, user_id, role, is_default, status)
SELECT t.id, t.created_by, 'owner', true, 'active'
FROM public.anime_tenants t
WHERE t.slug LIKE 'legacy-%'
  AND t.created_by IS NOT NULL
ON CONFLICT (tenant_id, user_id) DO NOTHING;

UPDATE public.projects p
SET tenant_id = t.id
FROM public.anime_tenants t
WHERE p.tenant_id IS NULL
  AND p.user_id = t.created_by
  AND t.slug = 'legacy-' || md5(p.user_id);

UPDATE public.documents d
SET project_id = (d.metadata->>'project_id')::uuid
WHERE d.project_id IS NULL
  AND d.metadata ? 'project_id'
  AND (d.metadata->>'project_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE public.documents d
SET tenant_id = p.tenant_id
FROM public.projects p
WHERE d.tenant_id IS NULL
  AND d.project_id = p.id;

UPDATE public.quota_usage q
SET tenant_id = p.tenant_id
FROM public.projects p
WHERE q.tenant_id IS NULL
  AND q.project_id = p.id;

ALTER TABLE public.anime_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime_tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime_platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access anime tenants" ON public.anime_tenants;
CREATE POLICY "service role full access anime tenants"
    ON public.anime_tenants FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service role full access anime tenant members" ON public.anime_tenant_members;
CREATE POLICY "service role full access anime tenant members"
    ON public.anime_tenant_members FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service role full access anime platform settings" ON public.anime_platform_settings;
CREATE POLICY "service role full access anime platform settings"
    ON public.anime_platform_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
