-- Rollback for Batch 4 payload security.
-- Credential redaction performed by the forward migration is irreversible.
DROP TRIGGER IF EXISTS trg_outbox_events_redact_payload ON public.outbox_events;
DROP TRIGGER IF EXISTS trg_api_commands_redact_payload ON public.api_commands;
DROP FUNCTION IF EXISTS public.redact_expired_payloads(integer);
DROP FUNCTION IF EXISTS public.redact_sensitive_payload_trigger();
DROP FUNCTION IF EXISTS public.redact_sensitive_payload(jsonb);
