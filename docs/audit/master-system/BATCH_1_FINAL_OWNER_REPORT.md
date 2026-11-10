# Batch 1 Final Owner Report

Date: 2026-11-09
Branch: `opencode/batch-1-foundation`
Status: **NOT CLOSED — AUTOMATED SCOPE PASS; RUNTIME GATES BLOCKED**

## A. Executive Summary

Batch 1 source work is implemented, hardened, committed, pushed, and passing the available automated gates. The latest backend cloud run passed 155 safe tests and 19 regression tests. Android cloud CI passed 24 JVM tests, 116 instrumentation tests, 2/2 Maestro flows, lint, and the debug APK build. The CPU worker passed 5/5 contract tests. All 14 canonical n8n workflows passed static validation.

Batch 1 cannot be closed. Isolated database replay/RLS, disposable n8n runtime callbacks, AWS read-only inventory, and integrated end-to-end evidence remain unavailable. No production system was touched. No workflow was imported, activated, or changed.

## B. Scope and Authority

Completed only the authorized Batch 1 foundation scope: Supabase auth/session, project ownership, schema alignment, outbox recovery, callback/reconciliation backend, encrypted infrastructure hydration, Android auth/session, CPU-worker contracts, and available regression evidence.

Not performed: Batch 2–4 work, Stage 5 (`OD-14`), production deployment (`OD-15`), production database/n8n/AWS/Telegram changes, credential rotation, destructive database operations, new workflows, PR merges, or unrelated features.

## C. Recovered and Completed Work

- Supabase password login, refresh-token rotation, logout revocation, HS256/JWKS verification, issuer/audience/expiry/`nbf` checks, and `service_role` rejection.
- Project creation and reads scoped to the authenticated owner; no all-zero UUID fallback and no cross-user list fallback.
- Additive schema alignment migration and rollback for `user_system_prompts`, project/episode/clip columns, and `outbox_events.processing_started_at`.
- Outbox stale-lease recovery, including `NULL` lease timestamps, atomic claim, retry/dead-letter handling, and idempotency conflict protection.
- Callback command/project binding, replay/signature rejection, reconcile outbox enqueue, and compensation when enqueue fails.
- Supervisor terminal-state immutability, failure/manual-review mapping, and stale `RECONCILING` escalation.
- Encrypted `user_infrastructure.config_encrypted` hydration for command dispatch.
- Command submission/read response redaction of provider secrets.
- Android Keystore-backed encrypted token storage, refresh/expiry persistence, refresh retry-once, backend logout, legacy plaintext cleanup, and backup exclusion.
- CPU-worker contract validation and 14-workflow static audit.

## D. Commits, Pull Requests, and Artifacts

| Repository | Branch | Latest commit | PR |
|---|---|---|---|
| Backend | `opencode/batch-1-foundation` | `504f555` plus this report commit | `https://github.com/bnaisolution/ai-anime-backend/pull/1` |
| Android | `opencode/batch-1-foundation` | `6d1a86b` | `https://github.com/bnaisolution/ai-anime-android/pull/1` |
| Worker | `main` | `da069d3` | Unchanged |

Backend PR base: `opencode/master-system-audit-reports`. Android PR base: `opencode/android-4-batch-testing`. Both PRs remain open and unmerged.

Latest hardening commit `504f555`:
- Revalidates idempotency after atomic insert, closing a concurrent replay race.
- Redacts nested provider credentials from command submission and read responses.
- Recovers outbox rows with `NULL` processing leases.
- Fixes the rollback SQL extra parenthesis.
- Restricts the `user_system_prompts` policy to `service_role` with `WITH CHECK`.
- Adds idempotency, redaction, SQL-balance, exact-rollback-restore, and policy-role tests.

## E. Test and CI Evidence

| Check | Evidence | Result |
|---|---|---|
| Backend build | Local `npm run build` | PASS |
| Backend unit | CI `42635029769` | PASS — 55 |
| Backend routes | CI `42635029769` | PASS — 65 |
| Backend static local | CI `42635029769` | PASS — 27 |
| Backend static cross-repo | CI `42635029769` | PASS — 8 |
| Backend safe total | CI `42635029769` | PASS — 155 |
| Backend regression | CI `42635029769` | PASS — 19 |
| Backend DB integration | Isolated DB required | BLOCKED — skipped |
| Android JVM | CI `42626123392` | PASS — 24 |
| Android instrumentation | CI `42626123392` | PASS — 116 |
| Android Maestro | CI `42626123392` | PASS — 2/2 |
| Android lint | CI `42626123392` | PASS |
| Android debug APK | CI `42624653122` | PASS |
| CPU worker contracts | Local `pytest` | PASS — 5/5 |
| n8n static contracts | Backend static CI | PASS — 14/14 workflows |

## F. Database Migration and Rollback

Source is hardened but not live-replayed.

- Migration: `supabase/migrations/002_batch1_schema_alignment.sql`
- Rollback: `supabase/migrations/002_batch1_schema_alignment_rollback.sql`
- Rollback `claim_outbox_batch` body now exactly matches the pre-Batch-1 function.
- Parenthesis-balance test passes for both migration and rollback.
- `user_system_prompts` policy is restricted to `service_role`.
- Isolated migration replay, rollback replay, live schema equality, and RLS validation remain `BLOCKED`.

## G. n8n and Worker Reliability

- All 14 canonical workflows were audited.
- No workflow contains a backend callback node, `stopAndError`, or `errorWorkflow` configuration.
- `continueOnFail` appears in existing nodes but is not callback, terminal-error, or reconciliation handling.
- No canonical workflow JSON was modified.
- Workflow-side `B1-06` remains `BLOCKED`: no specific workflow change was approved and no disposable runtime is available.
- Backend callback, signature, replay, reconcile, and supervisor paths are covered by mocked tests only.
- CPU-worker contract tests pass; worker runtime was not executed.

## H. Security, Ownership, and Auth

- Supabase JWTs are verified before identity is trusted.
- Service-role tokens cannot authenticate as users.
- Project ownership is checked against the verified subject; null-owner projects are denied.
- Header/body/query identity and project overrides are rejected.
- Command responses no longer expose provider credentials.
- Android tokens use Keystore-backed encrypted storage with backup disabled.
- Residual risk: dispatch-time provider configuration is still stored in outbox/command payloads for n8n delivery. API responses are redacted, but at-rest TTL/redaction remains a BYOD/Batch 4 requirement.

## I. Blockers and Unverified Areas

| Blocker | Impact |
|---|---|
| No isolated Supabase project | Migration replay, rollback replay, RLS, DB integration, and cross-user DB tests `BLOCKED` |
| No disposable n8n runtime | Callback, error-path, and reconciliation runtime tests `BLOCKED` |
| No AWS/Termius read-only access | `B1-08` inventory `BLOCKED` |
| No backend Actions secrets | Database integration job remains skipped |
| No physical Android device | Device behavior `NOT TESTED`; evidence is JVM/emulator only |
| No integrated environment | Android → backend → DB → n8n → worker → storage E2E `BLOCKED` |

## J. Owner Actions and Decision

Required to close the remaining gates:
1. Provide an isolated Supabase test project and test-only service-role key.
2. Provide a disposable n8n instance with the canonical workflows.
3. Provide read-only AWS/Termius evidence or access for `B1-08`.
4. Provide a physical-device Android run if device evidence is required.
5. Approve any specific workflow JSON change before `B1-06` workflow-side work begins.

Decision: **Batch 1 automated scope PASS; Batch 1 not closed.** No runtime, integrated, production, or workflow-runtime pass is claimed.
