-- Approval decisions become idempotent and replay-safe.
-- A retry with the same Idempotency-Key returns the original decision and
-- re-ensures the approved canon command exists exactly once.

ALTER TABLE public.approval_decisions
  ADD COLUMN IF NOT EXISTS decision_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS approval_decisions_decision_idempotency_key
  ON public.approval_decisions (project_id, decision_idempotency_key)
  WHERE decision_idempotency_key IS NOT NULL;
