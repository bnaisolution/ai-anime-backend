BEGIN;

-- Hybrid BYOD data-plane registry and platform wallet.
-- Additive and disabled by default. No existing project is moved automatically.

CREATE TABLE IF NOT EXISTS public.anime_tenant_databases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL UNIQUE REFERENCES public.anime_tenants(id) ON DELETE CASCADE,
    mode text NOT NULL DEFAULT 'central' CHECK (mode IN ('central', 'byod', 'platform_managed')),
    provider text NOT NULL DEFAULT 'supabase' CHECK (provider IN ('supabase', 'postgres', 'platform')),
    encrypted_dsn text,
    key_version integer NOT NULL DEFAULT 1,
    dsn_fingerprint text,
    dsn_host text,
    database_name text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'error', 'disabled')),
    schema_version integer NOT NULL DEFAULT 0,
    last_checked_at timestamptz,
    last_error text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anime_tenant_databases_status
    ON public.anime_tenant_databases (status, mode);

CREATE TABLE IF NOT EXISTS public.anime_tenant_db_audit (
    id bigserial PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.anime_tenants(id) ON DELETE CASCADE,
    actor_user_id text,
    action text NOT NULL CHECK (action IN (
        'test', 'connect', 'disconnect', 'health_check', 'migrate', 'rollback', 'provision'
    )),
    status text NOT NULL CHECK (status IN ('started', 'success', 'failed')),
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anime_tenant_db_audit_tenant
    ON public.anime_tenant_db_audit (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.anime_tenant_project_index (
    project_id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.anime_tenants(id) ON DELETE CASCADE,
    data_plane text NOT NULL DEFAULT 'central' CHECK (data_plane IN ('central', 'byod', 'platform_managed')),
    cutover_status text NOT NULL DEFAULT 'central' CHECK (cutover_status IN (
        'central', 'migrating', 'byod', 'rollback_pending', 'failed'
    )),
    source_checksum text,
    migrated_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anime_tenant_project_index_tenant
    ON public.anime_tenant_project_index (tenant_id, data_plane, cutover_status);

ALTER TABLE public.anime_platform_settings
    ADD COLUMN IF NOT EXISTS byod_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.anime_platform_settings
    ADD COLUMN IF NOT EXISTS platform_db_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.anime_platform_wallets (
    tenant_id uuid PRIMARY KEY REFERENCES public.anime_tenants(id) ON DELETE CASCADE,
    currency text NOT NULL DEFAULT 'USD',
    balance numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.anime_platform_wallet_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.anime_tenants(id) ON DELETE CASCADE,
    delta numeric NOT NULL,
    balance_after numeric NOT NULL CHECK (balance_after >= 0),
    currency text NOT NULL DEFAULT 'USD',
    reason text NOT NULL,
    idempotency_key text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_platform_wallet_ledger_idempotency
    ON public.anime_platform_wallet_ledger (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anime_platform_wallet_ledger_tenant
    ON public.anime_platform_wallet_ledger (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.credit_anime_wallet(
    p_tenant_id uuid,
    p_amount numeric,
    p_reason text,
    p_idempotency_key text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet public.anime_platform_wallets%ROWTYPE;
    v_existing public.anime_platform_wallet_ledger%ROWTYPE;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('status', 'invalid', 'reason', 'amount must be positive');
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing FROM public.anime_platform_wallet_ledger
        WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key
        LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object(
                'status', 'credited', 'balance', v_existing.balance_after,
                'currency', v_existing.currency, 'idempotent', true
            );
        END IF;
    END IF;

    INSERT INTO public.anime_platform_wallets (tenant_id, balance)
    VALUES (p_tenant_id, p_amount)
    ON CONFLICT (tenant_id) DO UPDATE
      SET balance = public.anime_platform_wallets.balance + EXCLUDED.balance,
          updated_at = now()
    RETURNING * INTO v_wallet;

    INSERT INTO public.anime_platform_wallet_ledger
      (tenant_id, delta, balance_after, currency, reason, idempotency_key, metadata)
    VALUES
      (p_tenant_id, p_amount, v_wallet.balance, v_wallet.currency, p_reason, p_idempotency_key, p_metadata);

    RETURN jsonb_build_object(
        'status', 'credited', 'balance', v_wallet.balance,
        'currency', v_wallet.currency, 'idempotent', false
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.debit_anime_wallet(
    p_tenant_id uuid,
    p_amount numeric,
    p_reason text,
    p_idempotency_key text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet public.anime_platform_wallets%ROWTYPE;
    v_existing public.anime_platform_wallet_ledger%ROWTYPE;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('status', 'invalid', 'reason', 'amount must be positive');
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing FROM public.anime_platform_wallet_ledger
        WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key
        LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object(
                'status', 'debited', 'balance', v_existing.balance_after,
                'currency', v_existing.currency, 'idempotent', true
            );
        END IF;
    END IF;

    SELECT * INTO v_wallet FROM public.anime_platform_wallets
    WHERE tenant_id = p_tenant_id FOR UPDATE;

    IF NOT FOUND OR v_wallet.balance < p_amount THEN
        RETURN jsonb_build_object(
            'status', 'insufficient_balance',
            'balance', COALESCE(v_wallet.balance, 0),
            'required', p_amount
        );
    END IF;

    UPDATE public.anime_platform_wallets
    SET balance = balance - p_amount, updated_at = now()
    WHERE tenant_id = p_tenant_id
    RETURNING * INTO v_wallet;

    INSERT INTO public.anime_platform_wallet_ledger
      (tenant_id, delta, balance_after, currency, reason, idempotency_key, metadata)
    VALUES
      (p_tenant_id, -p_amount, v_wallet.balance, v_wallet.currency, p_reason, p_idempotency_key, p_metadata);

    RETURN jsonb_build_object(
        'status', 'debited', 'balance', v_wallet.balance,
        'currency', v_wallet.currency, 'idempotent', false
    );
END;
$$;

ALTER TABLE public.anime_tenant_databases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime_tenant_db_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime_tenant_project_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime_platform_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime_platform_wallet_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access tenant databases" ON public.anime_tenant_databases;
CREATE POLICY "service role full access tenant databases"
    ON public.anime_tenant_databases FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service role full access tenant db audit" ON public.anime_tenant_db_audit;
CREATE POLICY "service role full access tenant db audit"
    ON public.anime_tenant_db_audit FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service role full access tenant project index" ON public.anime_tenant_project_index;
CREATE POLICY "service role full access tenant project index"
    ON public.anime_tenant_project_index FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service role full access platform wallets" ON public.anime_platform_wallets;
CREATE POLICY "service role full access platform wallets"
    ON public.anime_platform_wallets FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service role full access platform wallet ledger" ON public.anime_platform_wallet_ledger;
CREATE POLICY "service role full access platform wallet ledger"
    ON public.anime_platform_wallet_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.anime_tenant_databases,
  public.anime_tenant_db_audit,
  public.anime_tenant_project_index,
  public.anime_platform_wallets,
  public.anime_platform_wallet_ledger
FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.credit_anime_wallet(uuid, numeric, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debit_anime_wallet(uuid, numeric, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_anime_wallet(uuid, numeric, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_anime_wallet(uuid, numeric, text, text, jsonb) TO service_role;

GRANT ALL ON TABLE public.anime_tenant_databases,
  public.anime_tenant_db_audit,
  public.anime_tenant_project_index,
  public.anime_platform_wallets,
  public.anime_platform_wallet_ledger
TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.anime_tenant_db_audit_id_seq TO service_role;

COMMIT;
