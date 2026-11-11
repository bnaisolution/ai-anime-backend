DROP FUNCTION IF EXISTS public.record_anime_platform_usage(uuid, uuid, text, text, numeric, numeric, numeric, text, text, jsonb);
DROP FUNCTION IF EXISTS public.release_anime_platform_lease(uuid, uuid);
DROP FUNCTION IF EXISTS public.reserve_anime_platform_capacity(uuid, uuid, text, text, numeric, integer, text, jsonb);
DROP TABLE IF EXISTS public.anime_platform_usage;
DROP TABLE IF EXISTS public.anime_platform_queue;
DROP TABLE IF EXISTS public.anime_platform_leases;
DROP TABLE IF EXISTS public.anime_platform_pool_capacity;
