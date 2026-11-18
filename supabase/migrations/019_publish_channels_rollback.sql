-- Rollback for 019_publish_channels.sql
DROP TABLE IF EXISTS public.publish_oauth_states;
DROP TABLE IF EXISTS public.publish_channels;
