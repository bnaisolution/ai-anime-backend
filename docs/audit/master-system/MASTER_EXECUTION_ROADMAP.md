# Master Execution Roadmap

Date: 2026-11-09
Status: **ACTIVE EXECUTION PLAN — DOCUMENTATION ONLY; IMPLEMENTATION NOT AUTHORIZED**
Scope: Four-batch execution sequence derived from the 12 master-system audit reports. No implementation, migration, deployment, workflow activation, credential rotation, or production action was performed.

## 1. Purpose and Authority

This is the permanent execution roadmap for the four batches. It converts the 12 evidence reports into an ordered, testable plan.

It does not replace:

- `docs/contracts/OWNER_DECISION_REGISTER.md`;
- `docs/contracts/MASTER_ACCEPTANCE_MATRIX.md`;
- the approved six-stage implementation sequence;
- the requirement for explicit Owner approval before implementation or production action.

The batches group the remaining work. They do not bypass stage gates. Stage 1–3 artifacts are treated as the audit/test baseline; Batches 1–4 execute the remaining Stage 4–6 work.

## 2. Evidence Baseline

| Component | Revision / scope | Evidence | Status |
|---|---|---|---|
| Android | tested `44bfa15c5e23d09e51a2d3c681c9cca3b219f844`; reports `35d6158` | CI `42577400016`: 20/20 JVM, 116/116 instrumentation, 35/35 control suite, 2/2 Maestro, lint 25 findings / 0 errors | PASS — automated scope |
| Backend | `c6fc39865c44913eb0ba59065e99abff46f715fd` | build PASS, 123/123 safe, 19/19 regression; CI `42458161277` | PASS — automated scope |
| Database | live schema snapshot, 73 public tables | 10/10 static contract tests; 4 integration tests skipped | PASS — static; integration BLOCKED |
| CPU worker | `da069d3bb30d2389992cc8de82a9b5bad1e31eea` | 5/5 contract tests; CI `42457744833` | PASS — contracts; runtime NOT TESTED |
| n8n | 14 canonical workflows WF-00–WF-13 | 14/14 static validation; unique IDs; webhook path | PASS — static; runtime BLOCKED |
| GPU worker | configuration code only | no GPU repository, runtime, model, or credentials | NOT TESTED / BLOCKED |
| Telegram | mocked proxy and security tests | 8 route tests pass | PASS — mocked; live storage BLOCKED |
| Prompt Studio | Android UI and backend prompt routes | UI tests pass; category/default/tenant defects | FAIL — not accepted |
| BYOD / multi-user | project authorization tests | 60 route tests; cross-user/null-owner/spoof checks pass | Multi-user auth PASS; BYOD NOT IMPLEMENTED |
| Accessibility | automated scope | 5/5 automated tests pass; 33/33 screens tagged | PASS — automated; manual NOT TESTED |
| Android → AWS E2E | no isolated environment | no live dependencies contacted | BLOCKED |
| Full system | aggregate | see `FINAL_SYSTEM_ACCEPTANCE_REPORT.md` | NOT ACCEPTED |

### Current Position

| Item | State |
|---|---|
| Android automated scope | CONDITIONALLY ACCEPTED |
| Backend automated scope | TESTED AND PASSED |
| Database integration | BLOCKED |
| n8n runtime | BLOCKED |
| CPU worker runtime | NOT TESTED |
| GPU worker runtime | NOT TESTED / BLOCKED |
| Telegram live storage | BLOCKED |
| Prompt Studio | NOT ACCEPTED |
| BYOD | NOT IMPLEMENTED |
| Manual accessibility | NOT PERFORMED |
| Full E2E | BLOCKED |
| Full system | NOT ACCEPTED |
| Production | NOT TOUCHED |

## 3. Execution Rules

1. **Batch order is strict.** Batch 1 must pass its exit gate before Batch 2 implementation starts, and so on.
2. **No new n8n workflows.** Preserve exactly WF-00 through WF-13. Changes to existing workflows require explicit Owner approval.
3. **No production action.** No production deployment, database write, workflow activation/import, credential rotation, or destructive operation without explicit Owner approval.
4. **No secrets.** Never place tokens, keys, passwords, private URLs, or credentials in source, logs, reports, screenshots, or commits.
5. **No PASS without evidence.** A passing static test, mocked test, or fake-repository UI test does not prove runtime behavior.
6. **Use only these test classifications:** `PASS`, `FAIL`, `BLOCKED`, `NOT TESTED`. For work tracking, `NOT STARTED` means no implementation began.
7. **Inherit existing evidence.** Do not rerun passing suites merely to claim a new PASS. Re-run at a batch exit gate, or when code/configuration/environment changed.
8. **Isolated environments only.** Database, n8n, workers, Telegram, and E2E tests must use disposable test resources. A URL containing `prod` or `production` must be refused for test database work.
9. **Android testing stays in cloud CI.** Builds, SDK, AAPT2, lint, emulator, instrumentation, and Maestro run on GitHub Actions Ubuntu x86_64, never in Termux/ARM64.
10. **No unverified AWS claims.** Existing AWS-originated work must be recovered and verified, not recreated. AWS verification remains BLOCKED until an approved isolated environment exists.
11. **Evidence before status.** Every completed work item must record the exact command, run ID, artifact path, commit SHA, and result.
12. **No stage or acceptance claim without Owner approval.** Do not edit `PROJECT_STATE.md` or declare a stage complete without explicit confirmation.

## 4. Four-Batch Overview

| Batch | Objective | Primary Outcome | Entry Gate | Exit Gate |
|---|---|---|---|---|
| **1 — Foundation and command spine** | Make authentication, projects, database access, ownership, dispatch, callbacks, and reconciliation testable end to end | The core command loop can start and reach a terminal state in an isolated environment | Evidence baseline accepted; required Owner decisions identified | Batch 1 exit criteria all pass |
| **2 — Creative pipeline and Prompt Studio** | Make Prompt Studio, Story Bible, characters, lore, canon, continuity, episodes, scenes, and WF-02 → WF-03 functional | A project can create and persist creative content and dispatch an episode plan | Batch 1 exit gate | Batch 2 exit criteria all pass |
| **3 — Media, workers, and delivery** | Prove GPU/CPU TTS/FFmpeg, worker authorization, callbacks, Telegram storage, and Android media playback | Real media can be generated, stored, delivered, and played in an isolated environment | Batch 2 exit gate; worker/Telegram environments approved | Batch 3 exit criteria all pass |
| **4 — BYOD, hardening, and full acceptance** | Add BYOD only if authorized, close security/accessibility gaps, run full regression and isolated E2E, and obtain acceptance | Full system accepted or explicitly rejected with evidence | Batch 3 exit gate; BYOD authorization and required decisions | Batch 4 exit criteria all pass; Owner acceptance recorded |

## 5. Batch 1 — Foundation and Command Spine

### Objective

Make the core loop start and terminate correctly: approved authentication, project creation, registered routes, schema alignment, ownership enforcement, outbox dispatch, callback delivery, and reconciliation.

### Entry

- 12 reports accepted as the evidence baseline.
- Required Owner decisions identified, especially OD-03 and OD-13.
- Isolated test database plan approved.
- No production system contacted.

### Work Items

| ID | Work Item | Depends On | Required Evidence |
|---|---|---|---|
| B1-01 | Resolve login behavior under OD-03; no password bypass; define clean-install login path | OD-03 | Decision record; auth route tests; clean-install Android login result |
| B1-02 | Fix project creation and route registration; remove zero-UUID; register required project/read/creative routes; eliminate Android 404s | B1-01 | Project create 201; route tests; Android project create/select result |
| B1-03 | Align code with live schema; fix `api_commands`, `pending_actions`, `quota_usage`, `scenes`, `clips` mismatches; reconcile migration drift | B1-02 | Schema contract; migration replay/rollback; no undocumented drift |
| B1-04 | Verify ownership/RBAC against an isolated database; deny null-owner and cross-user access; reject identity spoofing; no auto-claim | B1-03 | Cross-user, null-owner, role, header/body/query spoof tests |
| B1-05 | Harden outbox dispatch: atomic claim, idempotency, timeout/retry behavior, duplicate prevention, terminal-state mapping | B1-03 | Dispatch tests; timeout/retry test; duplicate-work evidence |
| B1-06 | Implement callback and reconciliation path in existing WF-00–WF-13 only; add error handling; verify HMAC; prevent stuck `DISPATCHED`/`RECONCILING` | B1-05; OD-06 | Callback signature test; terminal-state test; workflow diff approval |
| B1-07 | Fix `user_infrastructure.config_encrypted` hydration in command and media paths | B1-03 | Hydration test; no plaintext `config` fallback |
| B1-08 | Run Batch 1 regression and record evidence | B1-01–B1-07 | Build, safe, regression, DB integration, command lifecycle |

### Exit Criteria

- [ ] OD-03 is recorded and the implemented login behavior matches it; no password bypass exists. If OD-03 is undecided, Batch 1 cannot exit.
- [ ] Project creation succeeds against an isolated database; no all-zero project UUID is sent; creation returns the documented success status.
- [ ] Every Android-required project/read/creative route returns a registered response, not an unintended 404.
- [ ] The 4 database integration tests pass against the isolated test database.
- [ ] Migration replay and rollback pass; remaining drift is either fixed or explicitly documented and accepted.
- [ ] A command can move from submission through outbox dispatch, workflow execution, callback, and terminal state without getting stuck.
- [ ] Callback HMAC verification passes; unsigned or invalid callbacks are rejected.
- [ ] A timeout/retry does not create duplicate work for the tested command path.
- [ ] Cross-user, null-owner, role, and identity-spoof tests pass against the isolated database.
- [ ] `config_encrypted` hydration returns the stored configuration.
- [ ] Evidence is recorded and no production system was touched.

## 6. Batch 2 — Creative Pipeline and Prompt Studio

### Objective

Make the creative layer usable and persistent: Prompt Studio, Story Bible, characters, lore, canon, continuity, episodes, scenes, and the WF-02 → WF-03 handoff.

### Entry

- Batch 1 exit gate passed.
- Isolated n8n and database environments available.
- OD-06 approval for any existing workflow change.

### Work Items

| ID | Work Item | Depends On | Required Evidence |
|---|---|---|---|
| B2-01 | Persist `prompt_category`; add a real update path; stop edits from creating duplicate rows | B1-03 | Prompt create/update/read round-trip |
| B2-02 | Stop `set_active` from overwriting project defaults; pass the selected project medium from Android instead of hardcoded `ANIME` | B2-01 | Project default unchanged after save; Android medium test |
| B2-03 | Add `user_id` and project filters to prompt pre-validation and active-prompt lookup | B2-01 | Cross-tenant and cross-project prompt tests |
| B2-04 | Verify Story Bible and project creative routes end to end | B1-02 | Bible save/read; command result; DB rows |
| B2-05 | Verify characters, lore, canon, and continuity routes and workflows | B1-02 | Route tests; WF-04/WF-06/WF-09 isolated runs |
| B2-06 | Verify episode/scene planning through WF-02 | B2-04 | Episode plan; scene/clip rows; command state |
| B2-07 | Make WF-02 invoke WF-03; verify dispatch with a deterministic stub before real media exists | B2-06; OD-06 | WF-02 → WF-03 dispatch evidence; expected pending state |
| B2-08 | Resolve workflow ID/env preflight mismatches; confirm exactly WF-00–WF-13; no WF-14 | B2-07 | ID map; env preflight; 14/14 static pass |
| B2-09 | Run Batch 2 regression and record evidence | B2-01–B2-08 | Prompt, creative, workflow, and regression evidence |

### Scope Decision

Prompt Studio genre templates, search, filters, favorites, versioning, and compatibility validation are NOT IMPLEMENTED in the reports. They are deferred unless the Owner explicitly adds them to Batch 2 scope. They are not part of the default exit gate.

### Exit Criteria

- [ ] Prompt create/update/read persists category correctly.
- [ ] Saving a prompt does not overwrite `projects.visual_medium` or `projects.active_system_prompt_id`.
- [ ] Android sends the selected project medium; no hardcoded `ANIME`.
- [ ] Prompt reads and active-prompt lookup are isolated by user and project.
- [ ] Story Bible save/read works in the isolated environment.
- [ ] Characters, lore, canon, and continuity pass route and isolated workflow tests.
- [ ] Episode planning produces the expected episode/scene/clip records.
- [ ] WF-02 invokes WF-03 and the job reaches the expected pending state; this does not claim real render completion.
- [ ] Workflow IDs and environment preflight resolve; exactly 14 workflows remain; no WF-14.
- [ ] Evidence is recorded and no production system was touched.

## 7. Batch 3 — Media, Workers, and Delivery

### Objective

Prove real media generation and delivery: GPU and CPU workers, signed worker authorization, callbacks, Telegram storage, and Android media playback.

### Entry

- Batch 2 exit gate passed.
- GPU and CPU worker environments approved.
- Telegram test bot and storage chat approved.
- OD-09 worker trust decision recorded.

### Work Items

| ID | Work Item | Depends On | Required Evidence |
|---|---|---|---|
| B3-01 | Obtain GPU worker source/runtime; verify health, model load, and VRAM/model compatibility | OD-09; GPU environment | Health output; model load; compatibility result |
| B3-02 | Verify GPU job dispatch, fallback, and checkpoint/resume behavior | B3-01 | Job output; fallback test; resume test |
| B3-03 | Run CPU TTS runtime for Svara and Supertonic | CPU environment | Audio artifacts; hashes; duration/quality check |
| B3-04 | Run CPU FFmpeg render runtime, including scenes, subtitles, concatenation, and upload | B3-03 | Video artifacts; render logs; output hash |
| B3-05 | Add and verify signed job-scoped worker authorization, replay protection, revocation, and no service-role use | OD-09 | Unsigned/replay/wrong-job rejection tests; revocation test |
| B3-06 | Verify backend → worker → backend callbacks and terminal state | B3-05 | Callback signatures; job state; no stuck command |
| B3-07 | Verify live Telegram upload, playback, ownership, quota, retention, and deletion | Telegram environment | Upload/playback evidence; quota/retention results |
| B3-08 | Verify Android media playback, authenticated media access, and cache behavior | B3-07 | Emulator/device playback; private-media denial test |
| B3-09 | Run Batch 3 regression and record evidence | B3-01–B3-08 | Worker, Telegram, Android media, and regression evidence |

### Exit Criteria

- [ ] GPU worker runtime is verified with real GPU evidence. If no GPU is available, Batch 3 is BLOCKED; a deterministic substitute may prove pipeline wiring but cannot satisfy GPU readiness.
- [ ] CPU TTS produces valid audio for both Svara and Supertonic.
- [ ] FFmpeg produces a valid rendered episode with expected scenes, subtitles, and output.
- [ ] Signed job-scoped authorization passes; unsigned, replayed, and wrong-job requests are rejected; no service-role credential is embedded.
- [ ] Worker callbacks reach the backend and move commands to the expected terminal state.
- [ ] Live Telegram upload and playback work; private media is denied to non-owners; quota/retention/deletion behavior is verified.
- [ ] Android plays generated media with authenticated access and correct cache behavior.
- [ ] Evidence is recorded and no production system was touched.

## 8. Batch 4 — BYOD, Hardening, and Full Acceptance

### Objective

Add BYOD only if authorized, close security and accessibility gaps, run full regression and isolated E2E, and obtain final acceptance.

### Entry

- Batch 3 exit gate passed.
- BYOD implementation authorized.
- OD-05, OD-07, OD-08, OD-10, OD-11, and OD-12 decisions recorded.
- Isolated multi-tenant environment approved.

### Work Items

| ID | Work Item | Depends On | Required Evidence |
|---|---|---|---|
| B4-01 | Record BYOD authorization and remaining decisions | Owner | Authorization record; decision updates |
| B4-02 | Implement tenant resolver, registry, and contracts with fail-closed behavior | B4-01 | Isolation tests; no client override |
| B4-03 | Implement onboarding/binding and per-tenant credential isolation | B4-02 | Create/validate/bind/unbind/rotate/revoke tests |
| B4-04 | Implement tenant-safe n8n strategy and worker cutover | B4-03; OD-06; OD-09 | Tenant-context workflow tests; signed worker tests |
| B4-05 | Move Android tokens to Keystore-backed storage; disable backup; add network security config; add BYOD onboarding UI if authorized | OD-11 | Security tests; backup exclusion; onboarding test |
| B4-06 | Add encryption-key versioning; remove fallback secrets; verify rotation/revocation | OD-12 | Key-version tests; no fallback-secret use |
| B4-07 | Verify quotas, budget, audit, and server-side owner/admin gating | B1-03 | Quota/audit tests; server-side role denial |
| B4-08 | Complete manual accessibility: TalkBack, Switch Access, font scaling, contrast, RTL, touch targets, focus order | Device/emulator access | Manual test record; fixed semantics; scanner results |
| B4-09 | Run full regression across Android, backend, workers, and n8n static | B4-02–B4-08 | Fresh exit-gate evidence |
| B4-10 | Run all 14 workflows in the isolated n8n runtime | B2-08; B4-04 | WF-00–WF-13 runtime evidence; no WF-14 |
| B4-11 | Run full isolated E2E: Android → backend → database → n8n → workers → Telegram → playback; verify AWS only if an approved environment exists | B4-09; B4-10 | E2E trace; callbacks; media; DB rows; AWS result or BLOCKED |
| B4-12 | Produce final acceptance decision and Owner sign-off | B4-11 | Updated final report; explicit acceptance or rejection |

### Exit Criteria

- [ ] BYOD is either explicitly authorized and isolation-tested, or explicitly deferred and not claimed.
- [ ] Tenant resolution is fail-closed; no client header/body/query can override tenant identity.
- [ ] Onboarding/binding/rotation/revocation pass in an isolated multi-tenant environment.
- [ ] Tenant-safe n8n and worker paths pass; no service-role default; no data movement without approved rollback.
- [ ] Android tokens are Keystore-backed; backup is disabled; network security config exists; BYOD onboarding works if in scope.
- [ ] Encryption keys are versioned; fallback secrets are removed; rotation/revocation is verified.
- [ ] Quotas, budget, audit, and server-side owner/admin gating pass.
- [ ] Manual accessibility and automated accessibility pass; no WCAG claim beyond tested evidence.
- [ ] Full regression passes with fresh exit-gate evidence.
- [ ] All 14 workflows run successfully in the isolated n8n runtime; no new workflow exists.
- [ ] Full isolated E2E passes; AWS verification is either completed in an approved environment or remains explicitly BLOCKED.
- [ ] Owner acceptance is recorded; full system acceptance is not claimed before this point.
- [ ] No production system was touched.

## 9. Feature Traceability Matrix

Backend route names are taken from the reports and current route inventory. Where the exact table or route is not confirmed by the reports, the row says “verify exact object” and the batch work item must confirm it.

| ID | Feature | Android Surface / Action | Backend Route / Service | Database Objects | n8n Workflow | Worker / Storage | Evidence / Status |
|---|---|---|---|---|---|---|---|
| F-01 | Authentication and session | `AuthScreen` login; `TokenManager` | `POST /api/v1/auth/login`, `GET /api/v1/auth/me`; auth routes/plugin | Auth tables per OD-03; live snapshot lacks `users`/workspace tables | None | None | JWT/route tests pass; login `503`; runtime BLOCKED |
| F-02 | Project create/list/detail/settings | `StudioDashboardScreen`, `ProjectDetailScreen`, `SettingsScreen` | `POST/GET /v1/anime/projects`, `PATCH /v1/anime/projects/:id`; projects service | `projects` | WF-00 bootstrap; WF-01 | None | UI tests pass; zero-UUID and runtime BLOCKED |
| F-03 | Ownership and RBAC | All project-scoped screens | `requireProjectRole`; project guard | `projects` | All project workflows | None | 60 route tests pass; live DB BLOCKED |
| F-04 | Story Bible | `BibleScreen` save/chat | `PATCH /v1/anime/projects/:id/bible`; creative service | `projects` plus Bible persistence objects (verify exact object) | WF-01 | None | UI pass; runtime NOT TESTED |
| F-05 | Budget and ledger | `BudgetLedgerScreen` | `PATCH /v1/anime/projects/:id/budget`; budget/ledger service | `quota_usage` (`accumulated_units`), budget/ledger tables (verify exact object) | WF-12 quota; WF-08 analytics | None | UI pass; runtime BLOCKED |
| F-06 | Characters, lore, canon | `CharacterListScreen`, `CharacterDetailScreen`, `CharacterDeepDiveScreen`, `LoreExplorerScreen`, `CanonViewerScreen` | `/v1/anime/characters`, `/characters/:cid`, reference-history, `/canon`, `/canon/proposals`; lore/canon services | `characters`, `canon_facts`, lore tables | WF-04, WF-09 | None | Route/UI pass; runtime BLOCKED |
| F-07 | Continuity | `ContinuityCheckerScreen` | `GET /v1/anime/continuity`; continuity service | Continuity objects (verify exact object) | WF-06 | None | Route/UI pass; runtime BLOCKED |
| F-08 | Episode planning and scenes | `EpisodePlannerScreen`, `SceneDetailScreen`, `ProductionScreen` | `PATCH /v1/anime/projects/:id/episodes/:episodeNo`, `PATCH .../scenes/:sceneId`; episode service | `episodes`, `scenes` (`dialogue_speaker_id`), `clips` (`voice_text`) | WF-02 | None | UI/route pass; WF-02 → WF-03 missing |
| F-09 | Prompt Studio | `PromptStudioScreen` tabs/save/reset | `GET/POST/DELETE /v1/anime/prompts`; infrastructure prompt routes; active-prompt lookup | `user_system_prompts`, `projects.visual_medium`, `projects.active_system_prompt_id` | WF-03 image path | None | UI pass; category/default/tenant FAIL |
| F-10 | Command submission and outbox | Studio/production actions | `POST /v1/anime/commands`; command service; outbox dispatcher | `api_commands`, `pending_actions` (`job_id`) | WF-00 `api/v1/router` | None | Route tests pass; callback/runtime BLOCKED |
| F-11 | Jobs, status, cancel, retry | `JobsMonitorScreen`, `ProductionScreen`, `AdminQueuesScreen` | `GET /v1/anime/jobs`, `/jobs/:id`, `/commands/:id`, `POST /jobs/:id/cancel`, `/retries`; jobs service | `api_commands`, `pending_actions` | WF-13 retry; WF-10 deadlock/state | None | UI/route pass; terminal-state BLOCKED |
| F-12 | Callback and reconciliation | None | `/internal/anime/n8n/callbacks`, worker callbacks; HMAC verifier; supervisor | `api_commands`, `pending_actions`, audit tables | All 14 workflows (no callback/error nodes) | Workers | HMAC unit pass; workflow delivery FAIL |
| F-13 | Quick image/video | `QuickToolsScreen` | Command intents; command service | `api_commands`, `clips` | WF-03 | GPU worker | UI pass; runtime BLOCKED |
| F-14 | Vision analysis | `VisionAnalysisScreen` | Vision route/command; vision service | Vision/analysis objects (verify exact object) | WF-05 | External AI/worker | UI pass; runtime BLOCKED |
| F-15 | Publish, review, QC | `PublishScreen`, `ReviewInboxScreen`, `QCScreen` | `PUBLISH_NOW` command; review/QC routes | `episodes`, `clips`, publish/review tables | WF-07, WF-04 gate, WF-11 | Telegram storage | UI pass; runtime BLOCKED |
| F-16 | Media library and playback | `MediaLibraryScreen` | `GET /v1/anime/media`, `GET /v1/media/telegram/:file_id`; media proxy | `clips`, `user_infrastructure.config_encrypted` | None | CPU worker Telegram upload; Telegram storage | Proxy tests pass; live BLOCKED; hydration FAIL |
| F-17 | Telegram proxy and storage | Media playback | Media proxy/security routes | `user_infrastructure`, media metadata | None | CPU worker upload | 8 tests pass; live BLOCKED |
| F-18 | Infrastructure and GPU setup | `SettingsScreen`, `WorkerManagerScreen` | `/v1/anime/infrastructure`, `/infrastructure/gpu`; infrastructure service | `user_infrastructure` | WF-03 `primary_gpu_url` | GPU worker | Auth/encryption tests pass; GPU runtime BLOCKED |
| F-19 | Quota | `QuotaDashboardScreen` | `GET /v1/anime/quota`; quota service | `quota_usage.accumulated_units` | WF-12 | None | UI pass; runtime BLOCKED |
| F-20 | Notifications | `NotificationScreen` | `GET /v1/anime/notifications`; notification service | Notification objects (verify exact object) | None | Telegram alert path | UI pass; runtime BLOCKED |
| F-21 | Analytics, audit, owner/admin | `AnalyticsScreen`, `AuditLogScreen`, `OwnerOverviewScreen`, `AdminQueuesScreen`, `WorkerManagerScreen`, `WorkflowManagerScreen`, `DatabaseScreen`, `AIBrainScreen` | Registered analytics/audit/admin routes; owner gating | `audit_log`, analytics objects | WF-08 analytics; WF-13 | None | UI/route pass; client-only owner gating; live data BLOCKED |
| F-22 | BYOD | No Android onboarding | Tenant resolver/registry/onboarding (planned) | Tenant registry; per-tenant routing (planned) | Per-tenant strategy (planned) | Per-tenant worker auth (planned) | NOT IMPLEMENTED |
| F-23 | Accessibility | All screens | None | None | None | None | 5/5 automated PASS; manual NOT TESTED |
| F-24 | Android token and backup security | Auth/`TokenManager`; manifest | None | None | None | None | FAIL: plaintext `SharedPreferences`, `allowBackup="true"` |
| F-25 | Full E2E | All surfaces | All services | All objects | All 14 workflows | All workers/storage | BLOCKED |

## 10. Existing Test Evidence and Non-Repeat List

These results are inherited. Do not rerun them to claim a new PASS. Re-run only at a batch exit gate, or when code, configuration, or environment changed.

| Evidence | Scope | Result | Reuse Rule |
|---|---|---|---|
| Android CI `42577400016` at `44bfa15c5e23d09e51a2d3c681c9cca3b219f844` | JVM, instrumentation, control suite, Maestro, lint | 20/20, 116/116, 35/35, 2/2, 0 errors | Inherit for automated scope |
| Android reports commit `35d6158` | Reports and evidence | Pushed | Inherit |
| Backend build and suites | Build, 123 safe, 19 regression | PASS | Inherit |
| Backend CI `42458161277` | Unit/routes/static/regression | 36/60/27/19 PASS; 4 DB skipped | Inherit automated scope |
| CPU worker CI `42457744833` | Contract tests | 5/5 PASS | Inherit contract scope |
| n8n static validation `2026-11-09` | 14 workflows | 14/14 PASS | Inherit static scope |
| Database static contract | 73 tables | 10/10 PASS | Inherit static scope |
| Telegram proxy tests | 8 route tests | PASS | Inherit mocked scope |
| Multi-user authorization tests | 60 route tests | PASS | Inherit route scope |
| Accessibility automated tests | 5 tests | 5/5 PASS | Inherit automated scope |
| Prompt Studio Android UI | Instrumentation/control suite | PASS | Inherit UI only; persistence FAIL |
| Master reports commit `78949e7` | 12 reports | Pushed | Inherit documentation baseline |

Non-repeat rule:

- Do not present fake-repository Android UI tests as backend persistence proof.
- Do not present mocked Telegram tests as live storage proof.
- Do not present n8n static validation as runtime proof.
- Do not present contract tests as TTS/FFmpeg runtime proof.
- Do not present static schema contracts as database integration proof.
- Do not present component passes as E2E proof.

## 11. Blockers and Dependencies

| Blocker / Dependency | Blocks | Required Resolution |
|---|---|---|
| OD-03 auth strategy undecided; login `503` | B1, all runtime E2E | Record and implement the approved auth strategy; no password bypass |
| OD-13 isolated test database unavailable | B1, B2, B4 | Provision disposable Supabase test project and test-only credentials |
| Disposable n8n instance unavailable | B1, B2, B4 | Provision isolated n8n and approve existing-workflow changes |
| OD-06 n8n strategy / workflow-change approval | B1, B2, B4 | Owner approval for callback/error/WF-02 changes; no new workflows |
| OD-09 worker trust undecided | B3, B4 | Approve signed job-scoped worker authorization model |
| GPU worker repository/runtime absent | B3 | Provide GPU source/runtime or keep Batch 3 BLOCKED |
| Telegram bot token/storage chat absent | B3 | Provide isolated Telegram test bot and storage chat |
| No isolated multi-tenant environment | B4 | Provision approved multi-tenant test environment |
| BYOD not authorized; OD-05/07/08/10 undecided | B4 | Record authorization and decisions before any BYOD work |
| OD-11 Android token/onboarding undecided | B4 | Approve Keystore storage, backup exclusion, onboarding |
| OD-12 encryption-key lifecycle undecided | B4 | Approve key versioning and rotation/revocation |
| Manual accessibility device/emulator unavailable | B4 | Provide test device/emulator access |
| AWS credentials/logs/deployment state absent | B4 | Recover and verify existing work in an approved isolated environment |
| Prompt Studio defects | B2 | Fix category persistence, default mutation, medium, tenant filters |
| Worker endpoints unauthenticated | B3 | Implement signed job-scoped authorization |
| `config_encrypted` hydration bug | B1, B3 | Read and verify `config_encrypted` in all paths |
| Migration/live schema drift | B1 | Reconcile migration and test replay/rollback |
| No callback/error nodes in workflows | B1 | Add to existing workflows only with approval |
| WF-02 does not invoke WF-03 | B2 | Fix existing WF-02; no new workflow |

## 12. Permanent Progress Register

Update this register only with verified evidence. Do not mark an item PASS because a related component passes. Use `NOT STARTED` for work that has not begun.

### Baseline Register

| ID | Item | Status | Evidence / Note | Last Updated |
|---|---|---|---|---|
| C-01 | Android automated scope | PASS | CI `42577400016`; conditional acceptance | 2026-11-09 |
| C-02 | Backend build/safe/regression | PASS | Local + CI `42458161277` | 2026-11-09 |
| C-03 | CPU worker contracts | PASS | CI `42457744833`; 5/5 | 2026-11-09 |
| C-04 | n8n static validation | PASS | 14/14; runtime BLOCKED | 2026-11-09 |
| C-05 | Database static contract | PASS | 10/10; 73 tables; integration BLOCKED | 2026-11-09 |
| C-06 | Telegram proxy/security | PASS | 8 mocked route tests; live BLOCKED | 2026-11-09 |
| C-07 | Multi-user project authorization | PASS | 60 route tests; BYOD NOT IMPLEMENTED | 2026-11-09 |
| C-08 | Accessibility automated | PASS | 5/5; manual NOT TESTED | 2026-11-09 |
| C-09 | Full system acceptance | BLOCKED | `FINAL_SYSTEM_ACCEPTANCE_REPORT.md` | 2026-11-09 |

### Batch Register

| ID | Batch | Work Item | Status | Evidence / Blocker | Last Updated |
|---|---|---|---|---|---|
| B1-01 | 1 | Auth strategy and login behavior | BLOCKED | OD-03 undecided; login `503` | 2026-11-09 |
| B1-02 | 1 | Project creation and route registration | NOT STARTED | Zero-UUID and 404 defects recorded | 2026-11-09 |
| B1-03 | 1 | Schema alignment and migration replay | NOT STARTED | Drift recorded | 2026-11-09 |
| B1-04 | 1 | Ownership/RBAC live verification | BLOCKED | Route tests pass; no isolated DB | 2026-11-09 |
| B1-05 | 1 | Outbox dispatch and idempotency | NOT STARTED | Callback/runtime unverified | 2026-11-09 |
| B1-06 | 1 | Callback and reconciliation | FAIL | No callback/error nodes in 14 workflows | 2026-11-09 |
| B1-07 | 1 | `config_encrypted` hydration | FAIL | Commands/media read `config` | 2026-11-09 |
| B1-08 | 1 | Batch 1 regression | NOT STARTED | Awaiting B1-01–B1-07 | 2026-11-09 |
| B2-01 | 2 | Prompt category persistence/update | FAIL | `CreatePromptBody` drops category; no update route | 2026-11-09 |
| B2-02 | 2 | Project-default safety and Android medium | FAIL | `set_active` mutates project; Android hardcodes `ANIME` | 2026-11-09 |
| B2-03 | 2 | Prompt tenant isolation | FAIL | Missing `user_id` filters | 2026-11-09 |
| B2-04 | 2 | Story Bible end to end | NOT TESTED | UI/route only; no runtime | 2026-11-09 |
| B2-05 | 2 | Characters/lore/canon/continuity | NOT TESTED | Route/UI only; no runtime | 2026-11-09 |
| B2-06 | 2 | Episodes/scenes/WF-02 | NOT TESTED | No isolated n8n | 2026-11-09 |
| B2-07 | 2 | WF-02 → WF-03 dispatch | FAIL | WF-02 only builds payload | 2026-11-09 |
| B2-08 | 2 | Workflow IDs/env preflight | FAIL | Stale fallback IDs recorded | 2026-11-09 |
| B2-09 | 2 | Batch 2 regression | NOT STARTED | Awaiting B2-01–B2-08 | 2026-11-09 |
| B3-01 | 3 | GPU runtime and model/VRAM | BLOCKED | No GPU repo/runtime/credentials | 2026-11-09 |
| B3-02 | 3 | GPU dispatch/fallback/checkpoint | NOT TESTED | Depends B3-01 | 2026-11-09 |
| B3-03 | 3 | CPU TTS runtime | NOT TESTED | Contract tests only | 2026-11-09 |
| B3-04 | 3 | CPU FFmpeg runtime | NOT TESTED | Contract tests only | 2026-11-09 |
| B3-05 | 3 | Signed worker authorization | FAIL | No signed job-scoped auth | 2026-11-09 |
| B3-06 | 3 | Worker callbacks | NOT TESTED | No worker runtime | 2026-11-09 |
| B3-07 | 3 | Live Telegram storage | BLOCKED | No token/chat | 2026-11-09 |
| B3-08 | 3 | Android media playback | NOT TESTED | No live media environment | 2026-11-09 |
| B3-09 | 3 | Batch 3 regression | NOT STARTED | Awaiting B3-01–B3-08 | 2026-11-09 |
| B4-01 | 4 | BYOD authorization/decisions | BLOCKED | BYOD not authorized; decisions pending | 2026-11-09 |
| B4-02 | 4 | Tenant resolver/registry/contracts | NOT STARTED | No source implementation | 2026-11-09 |
| B4-03 | 4 | Onboarding/binding/credentials | NOT STARTED | No source implementation | 2026-11-09 |
| B4-04 | 4 | Tenant n8n/worker cutover | NOT STARTED | Depends B4-02/B4-03 | 2026-11-09 |
| B4-05 | 4 | Android Keystore/backup/BYOD onboarding | FAIL | Plaintext `SharedPreferences`; `allowBackup="true"` | 2026-11-09 |
| B4-06 | 4 | Encryption key versioning/secret hygiene | FAIL | Single/versionless key; fallback secrets | 2026-11-09 |
| B4-07 | 4 | Quota/budget/audit/owner gating | BLOCKED | Route tests only; no live DB | 2026-11-09 |
| B4-08 | 4 | Manual and automated accessibility | PASS (automated) / NOT TESTED (manual) | 5/5 automated; manual not performed | 2026-11-09 |
| B4-09 | 4 | Full regression | PASS (baseline) | Re-run required at exit gate | 2026-11-09 |
| B4-10 | 4 | All 14 workflow runtime | BLOCKED | No disposable n8n | 2026-11-09 |
| B4-11 | 4 | Full isolated E2E / AWS verification | BLOCKED | No isolated environment; AWS not verified | 2026-11-09 |
| B4-12 | 4 | Final acceptance and Owner sign-off | BLOCKED | Full system not accepted | 2026-11-09 |

## 13. Required Owner Decisions

| Decision | Required For | Rule |
|---|---|---|
| OD-03 Auth strategy | B1-01, all runtime E2E | No login implementation while undecided |
| OD-06 n8n strategy / workflow changes | B1-06, B2-07, B4-04 | No workflow modification without approval |
| OD-09 Worker trust | B3-05, B4-04 | No worker auth implementation while undecided |
| OD-13 Test environments | B1–B4 | No runtime PASS without approved isolated environment |
| OD-05 Data-plane option | B4-01/B4-02 | No BYOD resolver work before decision |
| OD-07 `projects`/`documents` ownership | B4-01/B4-02 | No BYOD data movement before decision |
| OD-08 Credential model | B4-03 | No tenant credential implementation before decision |
| OD-10 Migration/rollback | B4-03/B4-04 | No tenant data movement without rollback |
| OD-11 Android token/onboarding | B4-05 | No BYOD Android implementation before decision |
| OD-12 Encryption key lifecycle | B4-06 | No key lifecycle change before decision |
| OD-14 Stage 5 start | B2/B4 | Do not start Stage 5 work without approval |
| OD-15 Production approval | Release only | No production action |

## 14. Risks and Controls

| Risk | Impact | Control |
|---|---|---|
| Declaring full acceptance from component passes | Unsafe release | Batch exit gates and E2E evidence |
| Treating mocks/fakes as runtime proof | False confidence | Status definitions and non-repeat rules |
| Starting BYOD before foundation is stable | Compounding defects | Strict batch order; B4 entry gate |
| Modifying workflows without approval | Governance violation | OD-06 approval; existing workflows only |
| Contacting production | Data/security incident | Isolated environments; URL guard; no production credentials |
| Migration drift causing data loss | Broken deployment | Replay/rollback before B1 exit |
| Secret leakage in reports or commits | Security exposure | No-secrets rule; review before commit |
| Login `503` hidden or bypassed | Auth bypass | OD-03 gate; no password bypass |
| Re-running inherited tests to claim progress | Misleading status | Non-repeat rule; fresh evidence only at gates |
| GPU unavailable but pipeline labeled ready | False GPU readiness | GPU-specific exit evidence; no substitute PASS |
| AWS work recreated instead of verified | Duplicate/unsafe deployment | Recover and verify existing work only |

## 15. Next-Session Instruction

1. Read this roadmap and the 12 reports in `docs/audit/master-system/`.
2. Verify the backend repository is on `opencode/master-system-audit-reports` and record the current HEAD.
3. Check the required decisions and environments: OD-03, OD-06, OD-09, OD-13, and the Batch 1 isolated database.
4. If any required decision or environment is missing, update the progress register with `BLOCKED` and stop. Do not implement around the blocker.
5. If Batch 1 is authorized, start only with B1-01. Before editing, provide the proposed changes and affected files as required by `AGENTS.md`.
6. After each work item, run the relevant build/tests, record exact evidence, and update the progress register. Do not mark PASS from intent.
7. Do not start Batch 2, 3, or 4 until the preceding batch exit criteria pass.
8. Do not modify workflows, contact production, rotate credentials, or move BYOD data without explicit approval.
9. At each batch exit, run the required regression and update this roadmap only with verified results.
10. The next implementation action after approvals is B1-01, not GPU work and not BYOD.

## 16. Evidence Index

- `docs/audit/master-system/COMPLETE_FEATURE_INVENTORY.md`
- `docs/audit/master-system/ANDROID_ALL_SCREENS_BUTTONS_TEST_REPORT.md`
- `docs/audit/master-system/BYOD_MULTI_USER_TEST_REPORT.md`
- `docs/audit/master-system/PROMPT_STUDIO_FULL_TEST_REPORT.md`
- `docs/audit/master-system/GPU_WORKER_TEST_REPORT.md`
- `docs/audit/master-system/CPU_WORKER_TEST_REPORT.md`
- `docs/audit/master-system/TELEGRAM_STORAGE_TEST_REPORT.md`
- `docs/audit/master-system/BACKEND_DATABASE_TEST_REPORT.md`
- `docs/audit/master-system/N8N_RUNTIME_TEST_REPORT.md`
- `docs/audit/master-system/ANDROID_AWS_END_TO_END_TEST_REPORT.md`
- `docs/audit/master-system/ACCESSIBILITY_TEST_REPORT.md`
- `docs/audit/master-system/FINAL_SYSTEM_ACCEPTANCE_REPORT.md`
- `docs/audit/BASELINE_AUDIT_2026-11-06.md`
- `docs/contracts/OWNER_DECISION_REGISTER.md`
- `docs/contracts/MASTER_ACCEPTANCE_MATRIX.md`

## 17. Safety Statement

- No implementation was performed.
- No migration was executed.
- No schema was changed.
- No n8n workflow was modified or activated.
- No credential was rotated.
- No production system was contacted.
- No stage was marked complete.
- No full-system acceptance was claimed.
