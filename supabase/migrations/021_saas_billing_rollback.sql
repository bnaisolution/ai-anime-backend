-- Rollback for 021_saas_billing.sql
DROP TABLE IF EXISTS public.billing_events;
DROP TABLE IF EXISTS public.onboarding_state;
DROP TABLE IF EXISTS public.usage_ledger;
DROP TABLE IF EXISTS public.subscriptions;
DROP TABLE IF EXISTS public.saas_plans;
