# Batch 1 Backend Test Report

Date: 2026-11-09
Branch: `opencode/batch-1-foundation`
Status: **NOT TESTED IN CLOUD — LOCAL TYPECHECK PASS**

## Executed evidence

| Check | Command | Result |
|---|---|---|
| TypeScript typecheck | `node node_modules/typescript/bin/tsc --noEmit` | PASS |
| Unit suites | Cloud CI required | NOT TESTED |
| Route suites | Cloud CI required | NOT TESTED |
| Static suites | Cloud CI required | NOT TESTED |
| Regression suites | Cloud CI required | NOT TESTED |
| Database integration | Isolated test DB required | BLOCKED |

No backend test suite was executed in Termux. The existing rule remains: backend and integrated tests run on GitHub Actions cloud runners.

## Tests added

| File | Coverage |
|---|---|
| `test/routes/auth.supabase.test.js` | Supabase login, refresh, logout, HS256 JWT, `service_role` rejection, invalid claims |
| `test/unit/projects.service.test.js` | Owner-scoped reads, no cross-user fallback, canonical project columns |
| `test/unit/commands.hydration.test.js` | `config_encrypted` decryption and outbox hydration |
| `test/unit/callbacks.test.js` | Callback command/project binding and reconcile enqueue |
| `test/unit/supervisor.test.js` | Terminal immutability, failure mapping, stale escalation, pending `job_id` |
| `test/unit/outbox.test.js` | Stale processing recovery and schema fallback |
| `test/static/migration.alignment.test.js` | Migration, rollback, schema-usage, and mass-failure regressions |

## CI wiring

`.github/workflows/backend-tests.yml` now includes `test/static/migration.alignment.test.js` in the static-local gate.

## Required next evidence

1. Push the backend branch and open a PR or dispatch `Backend Tests`.
2. Record the CI run ID, job outcomes, and test counts.
3. Update this report from `NOT TESTED` only after the cloud run completes.

## Decision

Backend source is type-safe. Automated test status remains **NOT TESTED** until cloud CI runs.
