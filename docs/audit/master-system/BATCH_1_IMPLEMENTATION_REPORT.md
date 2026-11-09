# Batch 1 Implementation Report

Date: 2026-11-09
Branch: `opencode/batch-1-foundation`
Scope: Batch 1 foundation only

## Status

| Area | Status | Evidence |
|---|---|---|
| Backend source changes | PASS | `tsc --noEmit` completed without errors |
| Backend automated suites | NOT TESTED | Not executed locally; cloud CI pending branch push |
| Android source changes | NOT TESTED | No local Android build or test execution |
| Android cloud CI | BLOCKED | Branch not yet pushed; no CI run exists |
| Database migration replay | BLOCKED | No isolated Supabase test database |
| n8n runtime callback validation | BLOCKED | No disposable n8n runtime |
| AWS read-only inventory | BLOCKED | No AWS/Termius access |
| Integrated E2E | BLOCKED | Auth/DB/n8n runtime evidence unavailable |

## Implemented

### Authentication

- Added Supabase Auth REST integration in `src/modules/auth/supabase.auth.ts`.
- Added password login, refresh-token rotation, and logout revocation endpoints in `src/modules/auth/auth.routes.ts`.
- Added Supabase HS256 and JWKS RS/ES JWT verification with issuer, audience, expiry, `nbf`, and `service_role` rejection.
- Preserved the internal HS256 test-token path behind `AUTH_INTERNAL_JWT_ENABLED`, enabled only in `NODE_ENV=test` by default.
- Removed the hardcoded production-like Supabase URL; `SUPABASE_URL` is now required.

### Ownership and schema correctness

- `getProject` now requires both `id` and authenticated `user_id`.
- Project listing no longer falls back to other users' projects.
- Project creation and patch paths now persist `genre`, `visual_medium`, and `description`.
- Overview prefers persisted project columns over story-bible fallbacks.

### Commands and infrastructure

- Command hydration now decrypts `user_infrastructure.config_encrypted`.
- Prompt lookup is scoped to the authenticated user.
- Idempotency replay now rejects a key bound to a different user.
- Atomic-command fallback now distinguishes missing RPC from real database errors and compensates when outbox insertion fails.

### Outbox, callbacks, and supervision

- Added stale `processing` outbox recovery with a lease timestamp and fallback.
- `claim_outbox_batch` now records `processing_started_at`.
- Callback handling verifies that `command_id` belongs to `project_id` before persisting or enqueuing reconciliation.
- Callback outbox insertion failure removes the callback inbox row so retries are not silently deduplicated.
- Supervisor reconciliation is terminal-state immutable, maps failures and manual review, and escalates stale `RECONCILING` commands.
- Removed age-based mass-failure of active commands from preflight and jobs cleanup.
- Pending actions are linked through `job_id`, not the nonexistent `command_id`.

### Android

- Added Android Keystore-backed `EncryptedSharedPreferences` with legacy plaintext cleanup.
- Added refresh-token and expiry persistence plus `saveSession`.
- Added refresh-token rotation in the OkHttp authenticator and retry-once behavior.
- Added backend logout and local session clearing.
- Disabled Android backup.
- Corrected owner defaults to `normal_user` and recognized `owner_admin`.

### Database

- Added additive migration `supabase/migrations/002_batch1_schema_alignment.sql`.
- Added rollback `supabase/migrations/002_batch1_schema_alignment_rollback.sql`.
- Migration covers `user_system_prompts`, missing project/episode/clip columns, and `outbox_events.processing_started_at`.

## Not claimed

- No cloud test pass is claimed.
- No Android compile or test pass is claimed.
- No live database migration or rollback pass is claimed.
- No n8n runtime callback pass is claimed.
- No integrated E2E pass is claimed.
- No production action was taken.
