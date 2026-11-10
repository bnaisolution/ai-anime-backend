-- Batch 4: provider/secret payload redaction at rest.
-- Credentials are no longer persisted in api_commands.payload or outbox_events.payload.
-- The trigger is defense-in-depth for legacy callers and future regressions.

CREATE OR REPLACE FUNCTION public.redact_sensitive_payload(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_key text;
    v_value jsonb;
    v_result jsonb;
BEGIN
    IF p_payload IS NULL THEN
        RETURN NULL;
    END IF;

    IF jsonb_typeof(p_payload) = 'object' THEN
        v_result := '{}'::jsonb;
        FOR v_key, v_value IN SELECT entry.key, entry.value FROM jsonb_each(p_payload) AS entry(key, value)
        LOOP
            IF regexp_replace(lower(v_key), '[^a-z0-9]', '', 'g') = ANY (ARRAY[
                'userinfrastructure', 'gpurouting', 'telegramstorage',
                'apikey', 'accesskey', 'secretkey', 'secret', 'token',
                'accesstoken', 'refreshtoken', 'idtoken', 'apitoken',
                'authtoken', 'bearertoken', 'sessiontoken', 'clientsecret',
                'bottoken', 'password', 'passwd', 'authorization',
                'privatekey', 'connectionstring', 'configencrypted',
                'credential', 'credentials'
            ]::text[]) THEN
                CONTINUE;
            END IF;
            v_result := v_result || jsonb_build_object(v_key, public.redact_sensitive_payload(v_value));
        END LOOP;
        RETURN v_result;
    END IF;

    IF jsonb_typeof(p_payload) = 'array' THEN
        SELECT COALESCE(jsonb_agg(public.redact_sensitive_payload(entry.value)), '[]'::jsonb)
        INTO v_result
        FROM jsonb_array_elements(p_payload) AS entry(value);
        RETURN v_result;
    END IF;

    RETURN p_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.redact_sensitive_payload_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.payload := public.redact_sensitive_payload(NEW.payload);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_api_commands_redact_payload ON public.api_commands;
CREATE TRIGGER trg_api_commands_redact_payload
    BEFORE INSERT OR UPDATE OF payload ON public.api_commands
    FOR EACH ROW
    EXECUTE FUNCTION public.redact_sensitive_payload_trigger();

DROP TRIGGER IF EXISTS trg_outbox_events_redact_payload ON public.outbox_events;
CREATE TRIGGER trg_outbox_events_redact_payload
    BEFORE INSERT OR UPDATE OF payload ON public.outbox_events
    FOR EACH ROW
    EXECUTE FUNCTION public.redact_sensitive_payload_trigger();

-- One-time cleanup for rows written before this migration. This is intentionally
-- irreversible: redacted credentials cannot be restored by the rollback file.
UPDATE public.api_commands
SET payload = public.redact_sensitive_payload(payload)
WHERE payload IS NOT NULL
  AND public.redact_sensitive_payload(payload) IS DISTINCT FROM payload;

UPDATE public.outbox_events
SET payload = public.redact_sensitive_payload(payload)
WHERE payload IS NOT NULL
  AND public.redact_sensitive_payload(payload) IS DISTINCT FROM payload;

-- TTL cleanup for any legacy/unknown sensitive keys that survive a write path.
-- The dispatcher calls this periodically; the function is idempotent.
CREATE OR REPLACE FUNCTION public.redact_expired_payloads(p_retention_hours integer DEFAULT 24)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cutoff timestamptz;
    v_count integer := 0;
    v_changed integer := 0;
BEGIN
    v_cutoff := now() - make_interval(hours => GREATEST(1, COALESCE(p_retention_hours, 24)));

    WITH changed AS (
        UPDATE public.api_commands
        SET payload = public.redact_sensitive_payload(payload)
        WHERE payload IS NOT NULL
          AND created_at < v_cutoff
          AND public.redact_sensitive_payload(payload) IS DISTINCT FROM payload
        RETURNING 1
    )
    SELECT count(*) INTO v_changed FROM changed;
    v_count := v_count + v_changed;

    WITH changed AS (
        UPDATE public.outbox_events
        SET payload = public.redact_sensitive_payload(payload)
        WHERE payload IS NOT NULL
          AND created_at < v_cutoff
          AND public.redact_sensitive_payload(payload) IS DISTINCT FROM payload
        RETURNING 1
    )
    SELECT count(*) INTO v_changed FROM changed;
    RETURN v_count + v_changed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redact_expired_payloads(integer) TO service_role;
