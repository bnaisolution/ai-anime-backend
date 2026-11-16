DROP INDEX IF EXISTS public.idx_kaggle_sessions_status;
DROP INDEX IF EXISTS public.idx_kaggle_sessions_tenant;
DROP INDEX IF EXISTS public.idx_kaggle_sessions_user_session;
ALTER TABLE public.kaggle_sessions
    ADD CONSTRAINT kaggle_sessions_session_name_key UNIQUE (session_name);
ALTER TABLE public.kaggle_sessions DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.kaggle_sessions DROP COLUMN IF EXISTS user_id;
