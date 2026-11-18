-- Rollback for 017_model_catalog.sql
DROP TABLE IF EXISTS public.user_model_preferences;
DROP TABLE IF EXISTS public.render_profiles;
DROP TABLE IF EXISTS public.ai_model_catalog;
