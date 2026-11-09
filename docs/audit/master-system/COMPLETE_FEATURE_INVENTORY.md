# Complete Feature Inventory

Date: 2026-11-09
Status: **SOURCE-DERIVED — PARTIAL RUNTIME EVIDENCE**

This inventory is derived from current source and executed tests. It does not claim a formal PRD exists. Where a requirement is inferred from Android commands, workflow names, or schema, it is labelled accordingly.

## Evidence baseline

| Component | Revision | Evidence |
|---|---|---|
| Android | tested `44bfa15c5e23d09e51a2d3c681c9cca3b219f844`; reports committed at `35d6158` | CI run `42577400016` |
| Backend | `c6fc39865c44913eb0ba59065e99abff46f715fd` | local build + 123 safe + 19 regression PASS; CI `42458161277` |
| CPU worker | `da069d3bb30d2389992cc8de82a9b5bad1e31eea` | 5/5 contract tests PASS; CI `42457744833` |
| n8n | 14 canonical workflows | static validation PASS; runtime BLOCKED |
| Database | live schema snapshot, 73 public tables | static contract PASS; integration BLOCKED |

## Android

| Item | Count / status |
|---|---|
| Screen files | 33 |
| Navigation routes | 35 (2 parameterized, 2 duplicate declarations) |
| Tabs | 14 |
| Interactive controls | 205 (99 actions, 56 fields, 13 dialogs, 23 menus, 14 tabs) |
| List surfaces | 24 |
| State references | 152 |
| JVM unit tests | 20/20 PASS |
| Instrumentation tests | 116/116 PASS |
| Control-level suite | 35/35 PASS; 280 control-label occurrences |
| Maestro flows | 2/2 COMPLETED |
| Android lint | 25 findings: 14 warning, 11 information, 0 errors |

### Android feature surfaces

| Surface | Status | Notes |
|---|---|---|
| Authentication | PARTIALLY IMPLEMENTED | Login UI and token plumbing exist; backend login is intentionally `503`; no verified credential store |
| Studio dashboard / project selection | IMPLEMENTED | Project list/create UI and tests pass with fake repositories |
| Project detail / settings / budget | IMPLEMENTED | UI and navigation tests pass; backend routes registered |
| Story Bible | IMPLEMENTED | UI and route coverage present |
| Episode planner / scenes / production | IMPLEMENTED | UI and navigation tests pass; real render pipeline not proven |
| Prompt Studio | PARTIALLY IMPLEMENTED / BROKEN | Category tabs and save UI exist; persistence defects remain (see Prompt Studio report) |
| Characters / lore / canon / continuity | IMPLEMENTED | 33-screen smoke and 35-control suite pass; live data not tested |
| Media library / quick tools / vision | IMPLEMENTED | UI tests pass; live Telegram/GPU media not tested |
| Jobs / QC / publish / review inbox | IMPLEMENTED | UI tests pass; workflow runtime not tested |
| Analytics / audit / admin queues / workers / workflows | IMPLEMENTED | UI tests pass; owner/admin role separation not runtime-tested |
| Notifications / quota / database / AI brain | IMPLEMENTED | UI tests pass; backend runtime data not verified |
| Accessibility | PARTIALLY IMPLEMENTED | 5/5 automated tests pass; manual TalkBack/contrast/scaling/RTL NOT PERFORMED |
| Secure token storage / backup exclusion | MISSING | `SharedPreferences` and `allowBackup="true"` remain |

## Backend

| Area | Status | Evidence |
|---|---|---|
| Build | TESTED AND PASSED | `npm run build` |
| Unit tests | TESTED AND PASSED | 36/36 |
| Route tests | TESTED AND PASSED | 60/60 |
| Static contract tests | TESTED AND PASSED | 27/27 |
| Known-blocker regressions | TESTED AND PASSED | 19/19 |
| Database integration | BLOCKED | 4 skipped; no isolated test database |
| Auth / JWT verification | PARTIALLY IMPLEMENTED | JWT verification, issuer/audience/expiry, identity-substitution rejection pass; password login disabled |
| Project ownership / RBAC | TESTED AND PASSED | Cross-user denial, null-owner denial, role enforcement, header/body/query spoof rejection |
| Lore / reads / creative routes | TESTED AND PASSED (route level) | 28 Lore routes registered and tested |
| Commands / outbox / callbacks | PARTIALLY IMPLEMENTED | Command validation, idempotency, HMAC callback verification pass; n8n runtime delivery not verified |
| Infrastructure / GPU setup | PARTIALLY IMPLEMENTED | Authenticated routes and encryption tests pass; Kaggle/GPU execution NOT TESTED |
| Prompt library | PARTIALLY IMPLEMENTED / BROKEN | Auth and ownership filters exist; category persistence and project-default mutation defects remain |
| Media / Telegram proxy | TESTED AND PASSED (mocked) | Auth, SSRF, redirect, content-type, ownership tests pass; live Telegram NOT TESTED |
| Approvals / analytics / admin / incidents | TESTED AND PASSED (route level) | Route tests pass; live database not tested |
| AI chat / AI brain | PARTIALLY IMPLEMENTED | Routes exist; external provider behavior NOT TESTED |

## CPU worker

| Endpoint / feature | Status |
|---|---|
| `POST /v1/tts/svara` | IMPLEMENTED; contract test PASS; runtime NOT TESTED |
| `POST /v1/tts/supertonic` | IMPLEMENTED; contract test PASS; runtime NOT TESTED |
| `POST /v1/ffmpeg/render-episode` | IMPLEMENTED; contract test PASS; runtime NOT TESTED |
| `GET /health` | IMPLEMENTED; contract test PASS |
| Telegram upload config | IMPLEMENTED; static test PASS; live upload NOT TESTED |
| Dependency pinning | TESTED AND PASSED | exact pins in `requirements.txt` |
| Worker endpoint authentication | MISSING | no signed job-scoped authorization |

## n8n

| Item | Status |
|---|---|
| Canonical workflows | 14/14 static validation PASS |
| Unique IDs and connection integrity | PASS |
| Webhook path `api/v1/router` | PASS |
| Runtime import/execution | BLOCKED |
| Backend callback delivery | NOT IMPLEMENTED in workflows |
| Error workflow / `stopAndError` | NOT IMPLEMENTED |
| WF-02 → WF-03 chaining | NOT IMPLEMENTED (WF-02 only builds a payload) |

## Database

| Item | Status |
|---|---|
| Public tables in live snapshot | 73 |
| Static schema contract | TESTED AND PASSED |
| Migration/live drift | PRESENT | migration file does not contain all live objects such as `user_system_prompts` and project prompt columns |
| RLS policies | metadata present; backend uses service role |
| Runtime integration | BLOCKED |

## BYOD / multi-user / Prompt Studio / GPU / Telegram / E2E

| Area | Status |
|---|---|
| BYOD tenant resolver / registry / onboarding | NOT IMPLEMENTED |
| BYOD Phase 0 decisions | approved in decision register; implementation not authorized/started |
| Multi-user project authorization | TESTED AND PASSED at route level |
| Prompt Studio target library | PARTIALLY IMPLEMENTED / BROKEN |
| GPU worker runtime | NOT TESTED / BLOCKED |
| Telegram live storage | BLOCKED |
| Android → AWS end-to-end | BLOCKED |

## Status legend

- IMPLEMENTED: source exists and relevant static/unit/route checks pass.
- PARTIALLY IMPLEMENTED: some behavior exists but acceptance is incomplete.
- MISSING: no implementation evidence.
- BROKEN: implemented behavior violates required semantics.
- NOT TESTED: no runtime evidence.
- TESTED AND PASSED: current automated evidence passes.
- BLOCKED: cannot execute without an approved isolated environment.
