-- Persist the scoped GPU worker token minted at Kaggle kernel deploy time.
-- n8n reads this token from the gateway and sends it to the Kaggle worker.
ALTER TABLE public.kaggle_sessions
    ADD COLUMN IF NOT EXISTS worker_token text;

COMMENT ON COLUMN public.kaggle_sessions.worker_token IS
    'Short-lived signed GPU worker token; used only for Kaggle tunnel job authentication.';
