# Backend and Database Test Report

Date: 2026-11-09
Status: **BACKEND TESTS PASSED — DATABASE INTEGRATION BLOCKED**

## Backend execution

| Suite | Tests | Pass | Fail | Skipped | Status |
|---|---:|---:|---:|---:|---|
| Build (`tsc`) | — | — | — | — | PASS |
| Unit | 36 | 36 | 0 | 0 | PASS |
| Routes | 60 | 60 | 0 | 0 | PASS |
| Static | 27 | 27 | 0 | 0 | PASS |
| Safe total | 123 | 123 | 0 | 0 | PASS |
| Regression | 19 | 19 | 0 | 0 | PASS |
| Database integration | 4 | 0 | 0 | 4 | BLOCKED |

Commands:

```sh
cd ai-anime-backend
npm run build
npm run test:safe
npm run test:regression
npm run test:db
```

CI run `42458161277` recorded the same 36 unit, 60 routes, 27 static, and 19 regression passes; 4 database integration tests were blocked.

## Database static contract

| Item | Result |
|---|---|
| Live schema snapshot | 73 public tables |
| Schema contract tests | 10/10 PASS |
| `projects` columns | verified, including `visual_medium`, `active_system_prompt_id` |
| `api_commands` columns | exactly `id`, `project_id`, `user_id`, `intent`, `payload`, `status`, `idempotency_key`, `body_hash`, `created_at` |
| `api_commands` absent columns | `updated_at`, `error_message`, `episode_no`, `result` |
| `pending_actions` link | `job_id`, not `command_id` |
| `quota_usage` | `accumulated_units` only |
| `scenes` | `dialogue_speaker_id`; no `dialogue` |
| `clips` | owns `voice_text` |
| RLS metadata | present on all 73 tables |

## Database integration blocker

The 4 integration tests are skipped unless all of these are set:

```sh
ALLOW_TEST_DB=1
TEST_SUPABASE_URL=https://<isolated-test-project>.supabase.co
TEST_SUPABASE_SERVICE_ROLE_KEY=<test-only key>
```

A URL containing `prod` or `production` is refused. No production database was accessed.

## Known migration drift

The migration file does not match the live snapshot:

- `user_system_prompts` is present in live but not in the migration file.
- `projects.visual_medium` and `projects.active_system_prompt_id` are live-only in the migration context.
- Other historical drift was recorded in `BASELINE_AUDIT_2026-11-06.md`.

Static contract tests use the live snapshot, not the migration file. A migration replay has not been tested.

## Open issues

- No isolated test database.
- No migration replay/rollback test.
- No live RLS policy test; backend uses the service role.
- No concurrency or idempotency test against a real database.

## Decision

Backend automated status is **TESTED AND PASSED** for build, safe suites, and regressions. Database integration remains **BLOCKED**. Do not claim live database correctness or migration readiness.

## Evidence

- `reports/android-testing/evidence/ci-backend-42458161277/`
- `ai-anime-backend/test/fixtures/Story_database.snapshot.txt`
- `ai-anime-backend/test/db/database.integration.test.js`
- `docs/audit/BASELINE_AUDIT_2026-11-06.md`
