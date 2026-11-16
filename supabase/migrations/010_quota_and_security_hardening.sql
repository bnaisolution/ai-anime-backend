BEGIN;

ALTER TABLE public.outbox_events
  ADD COLUMN IF NOT EXISTS payload_redacted_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS outbox_events_redaction_queue_idx
  ON public.outbox_events (created_at)
  WHERE payload IS NOT NULL AND payload_redacted_at IS NULL;

CREATE INDEX IF NOT EXISTS outbox_events_claim_queue_idx
  ON public.outbox_events (type, next_attempt_at, created_at)
  WHERE status = 'pending' AND attempts < 5;

CREATE INDEX IF NOT EXISTS outbox_events_processing_queue_idx
  ON public.outbox_events (processing_started_at)
  WHERE status = 'processing';

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

    WITH candidate AS (
        SELECT id, public.redact_sensitive_payload(payload) AS redacted_payload
        FROM public.outbox_events
        WHERE payload IS NOT NULL
          AND created_at < v_cutoff
          AND payload_redacted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 100
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.outbox_events o
    SET payload = c.redacted_payload,
        payload_redacted_at = now()
    FROM candidate c
    WHERE o.id = c.id;

    GET DIAGNOSTICS v_changed = ROW_COUNT;
    v_count := v_count + v_changed;

    WITH changed AS (
        UPDATE public.api_commands
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
SET search_path TO 'public'
AS $$
BEGIN
    UPDATE public.outbox_events
    SET status = 'pending',
        processing_started_at = NULL,
        next_attempt_at = now(),
        last_error = 'Recovered stale processing lease'
    WHERE status = 'processing'
      AND (processing_started_at IS NULL OR processing_started_at < now() - interval '10 minutes');

    UPDATE public.outbox_events
    SET status = 'dead_letter',
        processing_started_at = NULL,
        last_error = 'Max attempts exceeded'
    WHERE status = 'pending'
      AND attempts >= 5;

    RETURN QUERY
    WITH claimed AS (
        SELECT oe.id
        FROM public.outbox_events oe
        WHERE oe.status = 'pending'
          AND oe.attempts < 5
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
    SET status = 'processing',
        attempts = target.attempts + 1,
        processing_started_at = now()
    FROM claimed
    WHERE target.id = claimed.id
    RETURNING target.*;
END;
$$;

ALTER TABLE public.kaggle_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.kaggle_sessions,
  public.story_state,
  public.outbox_events,
  public.callback_inbox,
  public.audit_log,
  public.api_commands,
  public.pending_actions,
  public.user_infrastructure
FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.claim_outbox_batch(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redact_expired_payloads(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redact_sensitive_payload(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.insert_anime_command_atomic(uuid, uuid, text, text, jsonb, text, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_anime_platform_usage(uuid, uuid, text, text, numeric, numeric, numeric, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_anime_platform_lease(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_anime_platform_capacity(uuid, uuid, text, text, numeric, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snapshot_prompt_version() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_outbox_batch(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.redact_expired_payloads(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.redact_sensitive_payload(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_anime_command_atomic(uuid, uuid, text, text, jsonb, text, text, text, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_anime_platform_usage(uuid, uuid, text, text, numeric, numeric, numeric, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_anime_platform_lease(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_anime_platform_capacity(uuid, uuid, text, text, numeric, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.snapshot_prompt_version() TO service_role;

GRANT ALL ON TABLE public.kaggle_sessions,
  public.story_state,
  public.outbox_events,
  public.callback_inbox,
  public.audit_log,
  public.api_commands,
  public.pending_actions,
  public.user_infrastructure
TO service_role;

COMMIT;
