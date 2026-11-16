BEGIN;

CREATE OR REPLACE FUNCTION public.redact_expired_payloads(p_retention_hours integer DEFAULT 24)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.claim_outbox_batch(p_type text, p_batch_size integer DEFAULT 10)
RETURNS SETOF public.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT oe.id
    FROM public.outbox_events oe
    WHERE oe.status = 'pending'
      AND oe.next_attempt_at <= now()
      AND (
        oe.type = p_type
        OR (p_type = 'dispatch_n8n' AND oe.type LIKE 'ANIME_COMMAND_DISPATCH:%')
      )
    ORDER BY oe.next_attempt_at ASC, oe.created_at ASC
    LIMIT GREATEST(1, LEAST(p_batch_size, 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox_events target
  SET
    status = 'processing',
    attempts = target.attempts + 1,
    processing_started_at = now()
  FROM claimed
  WHERE target.id = claimed.id
  RETURNING target.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_outbox_batch(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.redact_expired_payloads(integer) TO service_role;

DROP INDEX IF EXISTS public.outbox_events_processing_queue_idx;
DROP INDEX IF EXISTS public.outbox_events_claim_queue_idx;
DROP INDEX IF EXISTS public.outbox_events_redaction_queue_idx;

ALTER TABLE public.outbox_events DROP COLUMN IF EXISTS payload_redacted_at;

COMMIT;
