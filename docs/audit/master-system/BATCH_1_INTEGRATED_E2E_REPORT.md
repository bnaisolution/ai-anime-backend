# Batch 1 Integrated E2E Report

Date: 2026-11-09
Status: **BLOCKED — NO RUNTIME EVIDENCE**

## Intended flow

1. Android obtains a Supabase access and refresh token.
2. Android refreshes on `401` and retries once.
3. Android logs out through the backend and clears the local session.
4. Backend verifies Supabase JWTs and rejects service identities.
5. Backend creates and reads only the authenticated user's projects.
6. Backend decrypts the user's infrastructure configuration and enqueues a command plus outbox event.
7. Existing n8n workflow executes and calls back.
8. Backend verifies the callback binding and enqueues reconciliation.
9. Supervisor reconciles a terminal state without rewriting it.

## Execution status

| Segment | Status | Reason |
|---|---|---|
| Android login/refresh/logout | PASS — component only | Android cloud run `42626123392`; no live backend integration |
| Backend auth route flow | PASS — component only | Backend CI run `42635029769` |
| Cross-user project isolation | PASS — mocked/route only | Isolated database remains BLOCKED |
| Encrypted command hydration | PASS — mocked only | Isolated database remains BLOCKED |
| Outbox claim and stale recovery | PASS — mocked only | Isolated database remains BLOCKED |
| n8n callback execution | BLOCKED | No disposable n8n runtime |
| Reconciliation terminal-state behavior | PASS — mocked only | No runtime command fixtures |
| Production verification | NOT AUTHORIZED | Prohibited |

## Required environment

- Isolated Supabase project with a test-only service-role key.
- Backend deployed or run on a cloud runner with test environment variables.
- Disposable n8n instance with the canonical workflow set.
- Test Telegram bot and storage channel, not production.
- Test user and project fixtures.

## Decision

Integrated E2E is **BLOCKED**. No end-to-end pass is claimed.
