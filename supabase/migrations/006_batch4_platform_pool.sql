-- Batch 4: Platform-Managed pooled capacity, queueing, metering, and billing.
-- Additive only. Platform-Managed remains disabled until explicit Owner approval.

CREATE TABLE IF NOT EXISTS public.anime_platform_pool_capacity (
    resource text NOT NULL,
    provider_id text NOT NULL,
    total_units numeric NOT NULL DEFAULT 0 CHECK (total_units >= 0),
    max_concurrency integer NOT NULL DEFAULT 1 CHECK (max_concurrency > 0),
    unit text NOT NULL DEFAULT 'job',
    enabled boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (resource, provider_id)
);

CREATE TABLE IF NOT EXISTS public.anime_platform_leases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.anime_tenants(id) ON DELETE CASCADE,
    project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    resource text NOT NULL,
    provider_id text NOT NULL,
    units numeric NOT NULL CHECK (units > 0),
    status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'active', 'released', 'expired')),
    idempotency_key text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_platform_leases_idempotency
    ON public.anime_platform_leases (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anime_platform_leases_capacity
    ON public.anime_platform_leases (resource, provider_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_anime_platform_leases_tenant
    ON public.anime_platform_leases (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.anime_platform_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.anime_tenants(id) ON DELETE CASCADE,
    project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    resource text NOT NULL,
    provider_id text NOT NULL,
    units numeric NOT NULL CHECK (units > 0),
    priority integer NOT NULL DEFAULT 100,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'leased', 'cancelled', 'expired')),
    idempotency_key text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_platform_queue_idempotency
    ON public.anime_platform_queue (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anime_platform_queue_order
    ON public.anime_platform_queue (resource, provider_id, status, priority, created_at);

CREATE TABLE IF NOT EXISTS public.anime_platform_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.anime_tenants(id) ON DELETE CASCADE,
    project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    resource text NOT NULL,
    provider_id text NOT NULL,
    units numeric NOT NULL CHECK (units >= 0),
    billable_units numeric NOT NULL DEFAULT 0 CHECK (billable_units >= 0),
    unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
    currency text NOT NULL DEFAULT 'USD',
    status text NOT NULL DEFAULT 'unbilled' CHECK (status IN ('unbilled', 'billed', 'void')),
    idempotency_key text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_platform_usage_idempotency
    ON public.anime_platform_usage (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anime_platform_usage_tenant
    ON public.anime_platform_usage (tenant_id, recorded_at);

ALTER TABLE public.anime_platform_pool_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime_platform_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime_platform_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime_platform_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access platform pool capacity" ON public.anime_platform_pool_capacity;
CREATE POLICY "service role full access platform pool capacity"
    ON public.anime_platform_pool_capacity FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service role full access platform leases" ON public.anime_platform_leases;
CREATE POLICY "service role full access platform leases"
    ON public.anime_platform_leases FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service role full access platform queue" ON public.anime_platform_queue;
CREATE POLICY "service role full access platform queue"
    ON public.anime_platform_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service role full access platform usage" ON public.anime_platform_usage;
CREATE POLICY "service role full access platform usage"
    ON public.anime_platform_usage FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.reserve_anime_platform_capacity(
    p_tenant_id uuid,
    p_project_id uuid,
    p_resource text,
    p_provider_id text,
    p_units numeric,
    p_ttl_seconds integer,
    p_idempotency_key text,
    p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capacity public.anime_platform_pool_capacity%ROWTYPE;
    v_existing public.anime_platform_leases%ROWTYPE;
    v_used numeric := 0;
    v_active integer := 0;
    v_lease public.anime_platform_leases%ROWTYPE;
    v_queue public.anime_platform_queue%ROWTYPE;
    v_position integer := 0;
BEGIN
    IF p_units IS NULL OR p_units <= 0 THEN
        RETURN jsonb_build_object('status', 'invalid', 'reason', 'units must be positive');
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing FROM public.anime_platform_leases
        WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key
        LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('status', v_existing.status, 'lease_id', v_existing.id, 'idempotent', true);
        END IF;
    END IF;

    SELECT * INTO v_capacity FROM public.anime_platform_pool_capacity
    WHERE resource = p_resource AND provider_id = p_provider_id
    FOR UPDATE;

    IF NOT FOUND OR v_capacity.enabled = false OR v_capacity.total_units <= 0 THEN
        RETURN jsonb_build_object('status', 'unavailable', 'reason', 'pool capacity is not enabled');
    END IF;

    SELECT COALESCE(SUM(units), 0), COUNT(*)
    INTO v_used, v_active
    FROM public.anime_platform_leases
    WHERE resource = p_resource AND provider_id = p_provider_id
      AND status IN ('reserved', 'active') AND expires_at > now();

    IF v_used + p_units <= v_capacity.total_units AND v_active < v_capacity.max_concurrency THEN
        INSERT INTO public.anime_platform_leases
            (tenant_id, project_id, resource, provider_id, units, status, idempotency_key, payload, expires_at)
        VALUES
            (p_tenant_id, p_project_id, p_resource, p_provider_id, p_units, 'reserved', p_idempotency_key, p_payload, now() + make_interval(secs => p_ttl_seconds))
        RETURNING * INTO v_lease;
        UPDATE public.anime_platform_queue
        SET status = 'leased', updated_at = now()
        WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key AND status = 'queued';
        RETURN jsonb_build_object('status', 'reserved', 'lease_id', v_lease.id, 'expires_at', v_lease.expires_at);
    END IF;

    INSERT INTO public.anime_platform_queue
        (tenant_id, project_id, resource, provider_id, units, priority, idempotency_key, payload)
    VALUES
        (p_tenant_id, p_project_id, p_resource, p_provider_id, p_units, 100, p_idempotency_key, p_payload)
    ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING * INTO v_queue;

    IF NOT FOUND THEN
        SELECT * INTO v_queue FROM public.anime_platform_queue
        WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key
        LIMIT 1;
    END IF;

    SELECT COUNT(*) INTO v_position FROM public.anime_platform_queue
    WHERE resource = p_resource AND provider_id = p_provider_id AND status = 'queued'
      AND (priority < v_queue.priority OR (priority = v_queue.priority AND created_at <= v_queue.created_at));

    RETURN jsonb_build_object('status', 'queued', 'queue_id', v_queue.id, 'position', v_position);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_anime_platform_lease(
    p_lease_id uuid,
    p_tenant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lease public.anime_platform_leases%ROWTYPE;
BEGIN
    UPDATE public.anime_platform_leases
    SET status = 'released', updated_at = now()
    WHERE id = p_lease_id AND tenant_id = p_tenant_id AND status IN ('reserved', 'active')
    RETURNING * INTO v_lease;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    RETURN jsonb_build_object('status', 'released', 'lease_id', v_lease.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_anime_platform_usage(
    p_tenant_id uuid,
    p_project_id uuid,
    p_resource text,
    p_provider_id text,
    p_units numeric,
    p_billable_units numeric,
    p_unit_price numeric,
    p_currency text,
    p_idempotency_key text,
    p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usage public.anime_platform_usage%ROWTYPE;
    v_amount numeric;
BEGIN
    v_amount := round(greatest(0, p_billable_units) * greatest(0, p_unit_price), 6);
    INSERT INTO public.anime_platform_usage
        (tenant_id, project_id, resource, provider_id, units, billable_units, unit_price, amount, currency, idempotency_key, metadata)
    VALUES
        (p_tenant_id, p_project_id, p_resource, p_provider_id, greatest(0, p_units), greatest(0, p_billable_units), greatest(0, p_unit_price), v_amount, upper(coalesce(p_currency, 'USD')), p_idempotency_key, p_metadata)
    ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING * INTO v_usage;

    IF NOT FOUND THEN
        SELECT * INTO v_usage FROM public.anime_platform_usage
        WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key
        LIMIT 1;
        RETURN jsonb_build_object('status', 'recorded', 'usage_id', v_usage.id, 'amount', v_usage.amount, 'currency', v_usage.currency, 'idempotent', true);
    END IF;

    IF p_project_id IS NOT NULL THEN
        INSERT INTO public.quota_usage (project_id, tenant_id, usage_date, service_type, accumulated_units, updated_at)
        VALUES (p_project_id, p_tenant_id, CURRENT_DATE, 'platform:' || p_resource, greatest(0, p_units), now())
        ON CONFLICT (project_id, usage_date, service_type)
        DO UPDATE SET accumulated_units = public.quota_usage.accumulated_units + greatest(0, p_units), updated_at = now();
    END IF;

    RETURN jsonb_build_object('status', 'recorded', 'usage_id', v_usage.id, 'amount', v_usage.amount, 'currency', v_usage.currency, 'idempotent', false);
END;
$$;
