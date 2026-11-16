BEGIN;

DROP FUNCTION IF EXISTS public.debit_anime_wallet(uuid, numeric, text, text, jsonb);
DROP FUNCTION IF EXISTS public.credit_anime_wallet(uuid, numeric, text, text, jsonb);

DROP TABLE IF EXISTS public.anime_platform_wallet_ledger;
DROP TABLE IF EXISTS public.anime_platform_wallets;
DROP TABLE IF EXISTS public.anime_tenant_project_index;
DROP TABLE IF EXISTS public.anime_tenant_db_audit;
DROP TABLE IF EXISTS public.anime_tenant_databases;

ALTER TABLE public.anime_platform_settings
    DROP COLUMN IF EXISTS platform_db_enabled;
ALTER TABLE public.anime_platform_settings
    DROP COLUMN IF EXISTS byod_enabled;

COMMIT;
