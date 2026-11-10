# Batch 1 Backend Test Report

Date: 2026-11-09
Branch: `opencode/batch-1-foundation`
Status: **CLOUD SAFE AND REGRESSION SUITES PASS — DATABASE INTEGRATION BLOCKED**

## Executed evidence

| Check | Evidence | Result |
|---|---|---|
| TypeScript build | Local `npm run build` | PASS |
| Unit suites | CI run `42635029769` | PASS — 55 tests |
| Route suites | CI run `42635029769` | PASS — 65 tests |
| Static local suites | CI run `42635029769` | PASS — 27 tests |
| Static cross-repo suites | CI run `42635029769` | PASS — 8 tests |
| Safe total | CI run `42635029769` | PASS — 155 tests |
| Regression suites | CI run `42635029769` | PASS — 19 tests |
| Database integration | Isolated test DB required | BLOCKED — skipped |

The first CI run `42622905010` failed one hydration assertion because the test expected provider configuration at the wrong nesting level. Commit `aaf7c6d` corrected the assertion to match the workflow contract `user_infrastructure.<provider_type>`. Run `42623461727` passed. The latest hardening commit `504f555` passed run `42635029769` with 155 safe and 19 regression tests.

## Tests added

| File | Coverage |
|---|---|
| `test/routes/auth.supabase.test.js` | Supabase login, refresh, logout, HS256 JWT, `service_role` rejection, invalid claims |
| `test/unit/projects.service.test.js` | Owner-scoped reads, no cross-user fallback, canonical project columns |
| `test/unit/commands.hydration.test.js` | `config_encrypted` decryption and outbox hydration |
| `test/unit/commands.idempotency.test.js` | Concurrent atomic-insert replay and body-hash conflict rejection |
| `test/unit/commands.redaction.test.js` | Submission/read response secret redaction |
| `test/unit/callbacks.test.js` | Callback command/project binding and reconcile enqueue |
| `test/unit/supervisor.test.js` | Terminal immutability, failure mapping, stale escalation, pending `job_id` |
| `test/unit/outbox.test.js` | Stale processing recovery, `NULL` lease recovery, and schema fallback |
| `test/static/migration.alignment.test.js` | Migration, rollback, exact function restore, SQL balance, policy role, schema-usage, and mass-failure regressions |

## CI wiring

`.github/workflows/backend-tests.yml` now includes `test/static/migration.alignment.test.js` in the static-local gate.

## Remaining evidence

- Isolated Supabase database integration remains `BLOCKED`.
- No migration replay or RLS validation was performed.

## Decision

Backend build, safe suites, and regressions **PASS**. Database integration remains **BLOCKED**.
