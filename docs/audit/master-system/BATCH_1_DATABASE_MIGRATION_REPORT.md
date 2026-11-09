# Batch 1 Database Migration Report

Date: 2026-11-09
Status: **MIGRATION AUTHORED — LIVE REPLAY BLOCKED**

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

All changes use `IF NOT EXISTS` or guarded constraint/policy creation.

## Evidence

| Check | Status |
|---|---|
| Migration source review | PASS |
| Rollback source review | PASS |
| Static alignment test added | NOT TESTED |
| Isolated migration replay | BLOCKED |
| Isolated rollback replay | BLOCKED |
| Live schema equality after replay | BLOCKED |
| RLS policy validation | BLOCKED |

## Blocker

No isolated Supabase test project or test-only credentials were available. No production database was accessed. A URL containing `prod` or `production` remains refused by the integration harness.

## Decision

Migration source is ready for isolated validation. Do not claim migration or rollback correctness until replay evidence exists.
