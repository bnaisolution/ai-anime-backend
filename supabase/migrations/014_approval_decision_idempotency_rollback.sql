DROP INDEX IF EXISTS public.approval_decisions_decision_idempotency_key;

ALTER TABLE public.approval_decisions
  DROP COLUMN IF EXISTS decision_idempotency_key;
