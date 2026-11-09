# Telegram Storage Test Report

Date: 2026-11-09
Status: **PROXY TESTS PASSED — LIVE STORAGE NOT TESTED**

## Summary

| Area | Status | Evidence |
|---|---|---|
| Telegram media proxy authentication | TESTED AND PASSED | 8 route tests |
| Private media ownership check | TESTED AND PASSED | Route test |
| Caller-supplied `bot_token` rejection | TESTED AND PASSED | Route test |
| SSRF / redirect protection | TESTED AND PASSED | Unit and route tests |
| File-path validation | TESTED AND PASSED | Unit tests |
| Content-type allowlist | TESTED AND PASSED | Unit test |
| Published master media access | TESTED AND PASSED | Route test |
| Live Telegram bot/storage | BLOCKED | No token/chat |
| Worker upload path | NOT TESTED | No live worker/Telegram |
| Infrastructure config hydration | BROKEN | `commands.service.ts` selects `config`, not `config_encrypted` |

## Verified proxy behavior

The backend Telegram proxy test suite covers:

1. Missing authentication is rejected for private media.
2. An authenticated non-owner is rejected.
3. A caller-supplied `bot_token` is rejected and not reflected.
4. Unsafe Telegram file paths are rejected before a second request.
5. Upstream redirects are not followed.
6. Private media is served only to the owning authenticated user.
7. Published master media is served without authentication.
8. Unknown assets return 404 and unconfigured storage returns 503.

## Open defects / gaps

- `commands.service.ts` reads `user_infrastructure.config`; the stored column is `config_encrypted`. This can leave user Telegram/GPU infrastructure unhydrated for workflow dispatch.
- The worker uploads to Telegram, but live bot token, chat id, and document upload were not tested.
- No live storage quota, retention, or deletion test was performed.
- No end-to-end Android → backend → worker → Telegram → playback test was performed.

## Blockers

- No approved Telegram bot token or storage chat.
- No isolated worker runtime.
- No live Android media playback environment.

## Decision

The authenticated proxy behavior is accepted at the mocked/static level. Live Telegram storage is **BLOCKED**, and infrastructure hydration remains a defect to fix.

## Evidence

- `ai-anime-backend/src/modules/anime/media/telegram.proxy.ts`
- `ai-anime-backend/src/modules/anime/media/telegram.security.ts`
- `ai-anime-backend/test/unit/telegram.security.test.js`
- `ai-anime-backend/test/routes/telegram.proxy.test.js`
- `ai-anime-backend/src/modules/anime/commands/commands.service.ts`
- `anime-cpu-worker/main.py`
