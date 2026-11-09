# Batch 1 Database Migration Report

Date: 2026-11-09
Status: **MIGRATION SOURCE HARDENED — LIVE REPLAY BLOCKED**

## Migration files

| File | Purpose |
|---|---|
| `supabase/migrations/002_batch1_schema_alignment.sql` | Additive live-schema alignment and outbox lease |
| `supabase/migrations/002_batch1_schema_alignment_rollback.sql` | Reverse the additive changes and restore the prior claim function |

## Objects covered

- Table: `user_system_prompts`
- `projects`: `visual_medium`, `active_system_prompt_id`
- `episodes`: `synopsis`, `updated_at`
- `clips`: `tg_image_file_id`, `tg_audio_file_id`, `tg_video_file_id`, `clip_url`, `provider`, `duration_sec`
- `outbox_events`: `processing_started_at`
- Function: `claim_outbox_batch` now records the processing lease

Additive columns use `IF NOT EXISTS` and the foreign key is guarded. The `user_system_prompts` policy is drop/recreated for `service_role` only with `WITH CHECK (true)` so an existing broader policy is not left in place.

## Evidence

| Check | Status |
|---|---|
| Migration source review | PASS |
| Rollback source review | PASS |
| Static alignment test | PASS — CI run `42635029769` |
| Rollback SQL parentheses balanced | PASS — static test |
| Rollback restores exact prior claim function | PASS — static test |
| `user_system_prompts` policy restricted to `service_role` | PASS — static test |
| Isolated migration replay | BLOCKED |
| Isolated rollback replay | BLOCKED |
| Live schema equality after replay | BLOCKED |
| RLS policy validation | BLOCKED |

## Audit corrections

- Removed the extra closing parenthesis in the rollback `claim_outbox_batch` body that made the rollback SQL invalid.
- Replaced the broad `USING (true)` policy with a `service_role`-scoped policy and `WITH CHECK (true)`.
- Added static tests for SQL parenthesis balance, exact rollback function restore, and policy role restriction.

## Blocker

No isolated Supabase test project or test-only credentials were available. No production database was accessed. A URL containing `prod` or `production` remains refused by the integration harness.

## Decision

Migration source is ready for isolated validation. Do not claim migration or rollback correctness until replay evidence exists.
