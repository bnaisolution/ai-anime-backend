# Android → AWS End-to-End Test Report

Date: 2026-11-09
Status: **BLOCKED — NO ISOLATED END-TO-END ENVIRONMENT**

## Summary

| Layer | Standalone evidence | E2E evidence |
|---|---|---|
| Android | 20/20 JVM, 116/116 instrumentation, 2/2 Maestro | NOT RUN |
| Backend | 123/123 safe, 19/19 regression | NOT RUN against live dependencies |
| Database | 73-table static contract | 4 integration tests BLOCKED |
| n8n | 14/14 static validation | Runtime BLOCKED |
| CPU worker | 5/5 contract tests | Runtime NOT TESTED |
| GPU worker | Configuration code only | NOT TESTED |
| Telegram | Mocked proxy tests PASS | Live storage BLOCKED |
| AWS deployment | Existing work not recreated | NOT VERIFIED |

## Why E2E is blocked

A trustworthy E2E run requires all of the following:

1. Disposable Supabase test project with the real migration and fixtures.
2. Backend configured with test-only secrets and callbacks.
3. Disposable n8n instance with the 14 canonical workflows imported.
4. CPU worker with deterministic TTS/FFmpeg payload.
5. GPU worker or deterministic GPU substitute.
6. Telegram test bot and storage chat.
7. Android client or HTTP harness exercising the same requests as the app.
8. Captured outbox events, callback signatures, job states, and audit rows.

None of these live dependencies is available. Production AWS, Supabase, n8n, Telegram, and worker endpoints were not contacted.

## Scenarios not executed

| Scenario | Blocked by |
|---|---|
| Android login → JWT → project creation | Login is `503`; no credential store |
| Project creation → backend → database | No isolated database |
| Command submission → outbox → n8n WF-00 | No disposable n8n |
| WF-02 → WF-03 production chain | No WF-02 → WF-03 call; no worker |
| Worker TTS/FFmpeg render | No worker runtime |
| Callback → command terminal state | No live n8n callback |
| Media upload → Telegram → playback | No live Telegram storage |
| Prompt Studio save → project default → episode generation | Prompt persistence defects; no runtime |
| Quota/budget/audit after generation | No live database |
| BYOD multi-tenant isolation | Not implemented |

## Existing AWS work

Existing AWS-originated work must be recovered and verified, not recreated. No AWS credentials, logs, or deployment state were available in this environment. AWS verification remains **BLOCKED**.

## Decision

End-to-end status is **BLOCKED**. Component-level Android, backend, worker-contract, and static workflow tests pass, but they do not constitute an E2E pass.

## Evidence

- `reports/android-testing/ANDROID_4_BATCH_FINAL_ACCEPTANCE.md`
- `reports/android-testing/evidence/ci-42577400016/`
- `reports/android-testing/evidence/ci-backend-42458161277/`
- `reports/android-testing/evidence/ci-worker-42457744833/`
- `reports/android-testing/evidence/n8n-static-2026-11-09/`
- `docs/testing/E2E_TEST_REPORT.md`
