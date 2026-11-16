-- Scope Kaggle worker sessions per user/tenant so GPU tunnels cannot leak across accounts.
ALTER TABLE public.kaggle_sessions
    ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE public.kaggle_sessions
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.anime_tenants(id) ON DELETE SET NULL;

ALTER TABLE public.kaggle_sessions
    DROP CONSTRAINT IF EXISTS kaggle_sessions_session_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kaggle_sessions_user_session
    ON public.kaggle_sessions (user_id, session_name);
CREATE INDEX IF NOT EXISTS idx_kaggle_sessions_tenant
    ON public.kaggle_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_kaggle_sessions_status
    ON public.kaggle_sessions (status, updated_at);
