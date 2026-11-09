# Master Execution Roadmap

Date: 2026-11-09
Status: **ACTIVE FOUR-BATCH PLAN — DOCUMENTATION ONLY; IMPLEMENTATION NOT AUTHORIZED**
Scope: Complete-system planning across backend, Android, database, n8n, CPU/GPU workers, providers, BYOD, AWS recovery, and Owner acceptance.

## 1. Purpose and Authority

This is the execution roadmap for the four required batches. It converts all approved Owner requirements, the 12 master audit reports, local contracts, current source, current CI, and the implementation handoff into one dependency-ordered plan.

Authority order:

1. `docs/contracts/OWNER_DECISION_REGISTER.md` — authoritative decisions.
2. `docs/contracts/MASTER_IMPLEMENTATION_HANDOFF.md` — consolidated implementation requirements.
3. `COMPLETE_OWNER_REQUIREMENTS_TRACEABILITY_MATRIX.md` — requirement-to-work mapping.
4. Current source, schema, CI, and test evidence.
5. Historical contracts and reports.

This roadmap does not authorize source changes, schema changes, migrations, workflow changes, credential rotation, APK release, deployment, AWS action, Stage 5 start, or production access.

## 2. Current Evidence Baseline

| Component | Revision / scope | Current evidence | Status |
|---|---|---|---|
| Android | tested `44bfa15c5e23d09e51a2d3c681c9cca3b219f844`; reports `35d6158` | CI `42577400016`: 20/20 JVM, 116/116 instrumentation, 35/35 control suite, 2/2 Maestro, lint 0 errors | PASS — automated scope |
| Backend | `c6fc39865c44913eb0ba59065e99abff46f715fd` | build PASS; 123/123 safe; 19/19 regression; current local combined run 142/142 | PASS — automated scope |
| Database | 73 public tables in snapshot | 10/10 static contract; 4 integration skipped | PASS — static; integration BLOCKED |
| CPU worker | `da069d3bb30d2389992cc8de82a9b5bad1e31eea` | 5/5 contract tests; runtime not executed | PASS — contracts; runtime NOT TESTED |
| n8n | 14 canonical workflows | 14/14 static validation; runtime not executed | PASS — static; runtime BLOCKED |
| GPU worker | configuration code only | no repository, runtime, model, or credentials | NOT TESTED / BLOCKED |
| Telegram | mocked proxy tests | 8 route/unit tests pass | PASS — mocked; live BLOCKED |
| Prompt Studio | UI plus backend routes | category/default/tenant defects remain | FAIL — not accepted |
| BYOD / multi-user | project authorization tests | route-level multi-user PASS; BYOD not implemented | PARTIAL |
| Accessibility | automated scope | 5/5 automated PASS; manual not performed | PARTIAL |
| Android → AWS E2E | no isolated environment | no live dependencies contacted | BLOCKED |
| AWS existing runtime | no access/logs | not inspected | BLOCKED |
| Full system | aggregate | multiple gates open | NOT ACCEPTED |

## 3. Decision and Authorization State

| Item | State | Planning consequence |
|---|---|---|
| OD-01–OD-13, OD-15, OD-16 | APPROVED | Requirements are in scope; no decision blocker |
| OD-12A / OD-12B | APPROVED | Versioned key registry and hybrid custody are in scope |
| OD-14 | OPEN | Stage 5 must not start |
| Implementation authorization | NOT GRANTED by this planning task | Batches are planned, not executable yet |
| Isolated environments | NOT PROVISIONED | Runtime work is BLOCKED |
| AWS access | NOT AVAILABLE | Recovery is BLOCKED |
| Production approval | OD-15 boundary only | No production action without explicit go-ahead |

Important corrections:

- **OD-06 is the backend-controlled access boundary**, not an undecided n8n strategy.
- All approved decisions remain in force even where older documents still describe them as options.
- Full Prompt Studio is mandatory and must not be deferred.
- BYOD implementation is approved in direction but still requires separate implementation authorization and environments.
- Stage 5 remains blocked by OD-14.

## 4. Execution Rules

1. **Batch order is strict.** A later batch cannot exit while an earlier gate is open.
2. **No new canonical workflows.** Preserve exactly `WF-00`–`WF-13`; no `WF-14`.
3. **No production action.** No deployment, production database write, workflow activation/import, credential rotation, or destructive operation without explicit approval.
4. **No secrets.** Never place tokens, keys, passwords, private URLs, or credentials in source, logs, reports, screenshots, or commits.
5. **No PASS without evidence.** Static, mocked, fake-repository, and component tests are not runtime proof.
6. **Test labels only:** `PASS`, `FAIL`, `BLOCKED`, `NOT TESTED`.
7. **Isolated environments only.** Use disposable database, n8n, workers, Telegram, and credentials. Refuse URLs containing `prod` or `production` for test database work.
8. **Android testing stays in cloud CI.** Builds, SDK, AAPT2, lint, emulator, instrumentation, and Maestro run on GitHub Actions Ubuntu x86_64, never in Termux/ARM64.
9. **AWS recovery, not recreation.** Existing AWS-originated work must be recovered and verified. No AWS resource may be recreated without explicit Owner approval.
10. **No workflow change without approval.** Existing workflows must remain byte-identical unless the Owner approves a specific change.
11. **Evidence before status.** Record command, run ID, artifact path, commit SHA, environment, and result.
12. **No stage or acceptance claim without Owner approval.** Do not edit `PROJECT_STATE.md` or declare a stage complete.

## 5. Four-Batch Overview

| Batch | Objective | Primary outcome | Entry gate | Exit gate |
|---|---|---|---|---|
| **1 — Foundation, identity, and command spine** | Establish authenticated identity, project/DB correctness, ownership, outbox, callbacks, reconciliation, and AWS recovery inventory | Core command loop can start and reach a terminal state in an isolated environment | Planning baseline accepted; implementation authorized; OD-13 environment plan approved | Batch 1 exit criteria pass |
| **2 — Creative pipeline, Prompt Studio, and memory** | Deliver the full Master Prompt Library, Story Bible/creative flows, WF-02 → WF-03, story/chat memory, and low-TPM behavior | A project can create, persist, reuse, and dispatch creative content | Batch 1 exit gate | Batch 2 exit criteria pass |
| **3 — Providers, media, workers, and delivery** | Prove OD-16 provider/model/fallback behavior, signed worker authorization, GPU/CPU media, Telegram storage, and Android playback | Real media and fallback paths work in an isolated environment | Batch 2 exit gate; worker/provider environments approved | Batch 3 exit criteria pass |
| **4 — BYOI, Android completion, hardening, and acceptance** | Complete BYOI/Platform-Managed, Owner dashboard, Android security/UX, encryption lifecycle, AWS verification, full runtime, and Owner acceptance | Full system accepted or explicitly rejected with evidence | Batch 3 exit gate; BYOI authorization/environments | Batch 4 exit criteria pass; Owner acceptance recorded |

## 6. Batch 1 — Foundation, Identity, and Command Spine

### Objective

Make the core system correct and testable: approved authentication, project creation/selection, schema alignment, ownership enforcement, outbox dispatch, callbacks, reconciliation, infrastructure hydration, and AWS recovery inventory.

### Entry

- Implementation authorized.
- OD-13 isolated database plan approved.
- No production system contacted.
- AWS recovery inventory approach approved (read-only).

### Work Items

| ID | Work item | Requirement links | Depends on | Required evidence |
|---|---|---|---|---|
| B1-01 | Implement approved Supabase Auth flow; backend JWT verification; refresh/logout/revocation; no password bypass | AUTH-01, AUTH-02, AUTH-04 | Authorization | Auth route tests; clean-install login; expiry/revocation tests |
| B1-02 | Fix project creation/registration, remove all-zero project fallback, ensure required project/read routes return registered responses | AUTH-03, GOV-03 | B1-01 | Project create 201; route tests; Android project create/select |
| B1-03 | Align code with live schema; fix `api_commands`, `pending_actions`, `quota_usage`, `scenes`, `clips` mismatches; reconcile migration drift | DB-06 | B1-02 | Schema contract; migration replay/rollback; documented drift |
| B1-04 | Enforce user/project ownership end to end; fix `getProject`, remove arbitrary list fallback; deny null-owner/cross-user/spoof | AUTH-03, DB-01 | B1-03 | Cross-user, null-owner, role, spoof tests |
| B1-05 | Harden outbox: atomic claim, idempotency, timeout/retry, duplicate prevention, terminal-state mapping | GOV-03 | B1-03 | Dispatch/timeout/retry/duplicate tests |
| B1-06 | Add callback, error, and reconciliation handling inside existing WF-00–WF-13 only; verify HMAC and no stuck states | N8N-02, AUTH-10 | B1-05; workflow approval | Callback signature; terminal-state; workflow diff approval |
| B1-07 | Fix `user_infrastructure.config_encrypted` hydration in all command/media paths | DB-06 | B1-03 | Hydration test; no plaintext `config` fallback |
| B1-08 | Read-only AWS runtime recovery inventory: account, region, resources, deployment, logs, backups, DNS, secrets references, ownership tags | TEST-08 | Owner access | Completed checklist; no resource changes |
| B1-09 | Run Batch 1 regression and record evidence | TEST-01, TEST-11 | B1-01–B1-08 | Build, safe, regression, DB integration, command lifecycle |

### Exit Criteria

- [ ] Approved auth works; login no longer returns `503`; no password bypass.
- [ ] Project creation/registration is correct; no all-zero project UUID is sent.
- [ ] Required Android routes return registered responses, not unintended 404s.
- [ ] Database integration tests pass against the isolated test database.
- [ ] Migration replay/rollback passes; remaining drift is fixed or explicitly accepted.
- [ ] Cross-user, null-owner, role, and identity-spoof tests pass against the isolated database.
- [ ] A command reaches a terminal state through outbox, workflow, callback, and reconciliation.
- [ ] Callback HMAC and replay rejection pass; no unsigned callback is accepted.
- [ ] `config_encrypted` hydration works; no plaintext fallback remains.
- [ ] AWS recovery inventory is complete; no AWS resource was changed.
- [ ] Evidence recorded; no production system touched.

## 7. Batch 2 — Creative Pipeline, Prompt Studio, and Memory

### Objective

Deliver the full creative layer: Master Prompt Library, category persistence, versioning, search/filter/favorites, genre/format templates, Story Bible, characters/lore/canon/continuity, episodes/scenes, WF-02 → WF-03, real memory, and low-TPM behavior.

### Entry

- Batch 1 exit gate passed.
- Isolated n8n and database available.
- Any workflow change explicitly approved.
- Schema change for `prompt_category` explicitly approved.

### Work Items

| ID | Work item | Requirement links | Depends on | Required evidence |
|---|---|---|---|---|
| B2-01 | Add approved `prompt_category` persistence and update/PATCH path; stop duplicate-row edits | PROMPT-01, PROMPT-02 | B1-03; schema approval | Create/update/read round-trip |
| B2-02 | Stop prompt save from mutating project medium/default; Android sends selected medium | PROMPT-03 | B2-01 | Project default unchanged; Android medium test |
| B2-03 | Add user/project/tenant filters to prompt pre-validation and active-prompt lookup | PROMPT-04 | B2-01 | Cross-tenant/cross-project prompt tests |
| B2-04 | Build Master Prompt Library: genres, formats, custom prompts, organization | PROMPT-08, PROMPT-09, PROMPT-17 | B2-01 | Library UI/API tests |
| B2-05 | Add search, filters, favorites, versioning | PROMPT-05, PROMPT-06, PROMPT-07 | B2-04 | Search/filter/favorite/version tests |
| B2-06 | Add multi-select at project creation, auto-associate with Story Bible, and shared-library access from all four surfaces | PROMPT-10, PROMPT-11, PROMPT-15 | B2-04 | Creation/Bible/episode/studio tests |
| B2-07 | Add compatibility validation for genre/format/medium/model | PROMPT-16 | B2-04 | Negative/positive compatibility tests |
| B2-08 | Verify Story Bible, characters, lore, canon, and continuity routes/workflows | GOV-01 | B1-02 | Route tests; WF-01/04/06/09 isolated runs |
| B2-09 | Verify episode/scene planning through WF-02; episode overrides do not corrupt defaults | PROMPT-12 | B2-06 | Episode plan; scene/clip rows; override test |
| B2-10 | Make WF-02 invoke WF-03; verify deterministic dispatch before real media | PROMPT-14, N8N-03 | B2-09; workflow approval | WF-02 → WF-03 dispatch evidence |
| B2-11 | Wire IMAGE prompts into image generation and verify WF-03 usage | PROMPT-13 | B2-10 | IMAGE prompt reaches generation |
| B2-12 | Replace random story embeddings with real tested retrieval or disable until correct | MEM-01 | B1-03 | Semantic retrieval/isolation test |
| B2-13 | Improve Chat memory retrieval, scopes, correction/dedup, deletion, and local/server reconciliation | MEM-02–MEM-05 | B2-12 | Memory correctness/isolation/delete tests |
| B2-14 | Implement low-TPM budgets, rate limits, backoff/jitter, header handling, retry-storm prevention | MEM-06 | B1-03 | Low-TPM/rate-limit/fallback tests |
| B2-15 | Run Batch 2 regression and record evidence | TEST-01 | B2-01–B2-14 | Prompt, creative, memory, workflow, regression evidence |

### Exit Criteria

- [ ] Prompt category persists and round-trips.
- [ ] Create, update, delete, search, filter, favorite, and version prompts work.
- [ ] Saving a prompt does not change project medium or active default.
- [ ] No cross-tenant or cross-project prompt is returned or injected.
- [ ] Genre templates, formats, custom prompts, and multi-select project creation work.
- [ ] Shared library is reachable from project creation, Story Bible, episode production, and Prompt Studio.
- [ ] Compatibility validation rejects incompatible combinations.
- [ ] Story Bible/creative routes and workflows pass isolated tests.
- [ ] Episode overrides do not corrupt project defaults.
- [ ] WF-02 invokes WF-03; IMAGE prompts reach image generation.
- [ ] Story/Chat memory is real, scoped, correctable, deletable, and isolated.
- [ ] Low-TPM behavior passes budget/rate-limit/fallback/retry tests.
- [ ] Exactly 14 canonical workflows remain; no WF-14.
- [ ] Evidence recorded; no production system touched.

## 8. Batch 3 — Providers, Media, Workers, and Delivery

### Objective

Prove OD-16 provider/model/fallback behavior and real media delivery: GPU/CPU workers, signed worker authorization, callbacks, TTS/FFmpeg, Telegram storage, and Android media playback.

### Entry

- Batch 2 exit gate passed.
- GPU/CPU/Telegram/provider test environments approved.
- OD-09 signed worker authorization implementation authorized.
- OD-16 provider credentials available for isolated testing.

### Work Items

| ID | Work item | Requirement links | Depends on | Required evidence |
|---|---|---|---|---|
| B3-01 | Implement provider registry for Groq, Gemini, NVIDIA NIM, compatible APIs; primary/secondary/priority/model selection | PROV-01, PROV-02 | B1-03 | Provider config/selection tests |
| B3-02 | Implement Auto/Simple/Advanced and task-specific model selection | PROV-11, PROV-12 | B3-01 | Model selection tests |
| B3-03 | Implement compatibility filtering by GPU, VRAM, dependencies, weights | PROV-13 | B3-02; GPU metadata | Compatibility test matrix |
| B3-04 | Implement universal fallback: primary-only, manual/automatic, priority, no silent paid fallback, checkpoint/resume | PROV-07–PROV-10 | B3-01 | Fallback/resume/no-paid tests |
| B3-05 | Obtain GPU source/runtime; verify health, model load, VRAM, compatibility | PROV-03 | GPU environment | GPU health/model evidence |
| B3-06 | Implement signed job-scoped worker auth, replay protection, revocation, no service-role | AUTH-09, AUTH-10 | OD-09 authorization | Positive/negative/replay/revocation tests |
| B3-07 | Verify CPU TTS Svara/Supertonic and FFmpeg render | PROV-04, TEST-06 | CPU environment | Audio/video artifacts and hashes |
| B3-08 | Verify GPU dispatch, fallback, checkpoint/resume | PROV-03, PROV-10 | B3-05 | GPU job/fallback/resume evidence |
| B3-09 | Verify backend → worker → backend callbacks and terminal state | AUTH-10 | B3-06 | Callback signatures; job state |
| B3-10 | Verify live Telegram upload, playback, ownership, quota, retention, deletion | PROV-05 | Telegram environment | Upload/playback/quota/delete evidence |
| B3-11 | Verify Android media playback, authenticated access, cache behavior | PROV-05 | B3-10 | Emulator/device playback; denial test |
| B3-12 | Run Batch 3 regression and record evidence | TEST-01 | B3-01–B3-11 | Provider, worker, Telegram, Android, regression evidence |

### Exit Criteria

- [ ] Primary-only provider configuration works without any secondary.
- [ ] Manual/automatic fallback works and is observable.
- [ ] No silent paid fallback; paid fallback requires explicit permission.
- [ ] Job state survives safe fallback; checkpoint/resume works.
- [ ] Provider/model compatibility filtering works.
- [ ] GPU runtime is verified with real GPU evidence; no substitute is labeled GPU-ready.
- [ ] CPU TTS and FFmpeg produce valid artifacts.
- [ ] Signed job-scoped worker authorization passes; unsigned/replayed/wrong-job requests fail.
- [ ] Worker callbacks reach terminal state; no service-role credential is embedded.
- [ ] Live Telegram upload/playback/quota/retention/deletion work.
- [ ] Android plays generated media with authenticated access.
- [ ] Evidence recorded; no production system touched.

## 9. Batch 4 — BYOI, Android Completion, Hardening, and Acceptance

### Objective

Complete BYOI/Platform-Managed, Owner dashboard, Android security/UX, encryption lifecycle, AWS recovery verification, full runtime, accessibility, and Owner acceptance.

### Entry

- Batch 3 exit gate passed.
- BYOD implementation authorized.
- Isolated multi-tenant environment approved.
- AWS read-only recovery access or approved verification environment available.
- Android device/emulator and manual accessibility session available.

### Work Items

| ID | Work item | Requirement links | Depends on | Required evidence |
|---|---|---|---|---|
| B4-01 | Implement tenant resolver/registry/contracts with fail-closed behavior | DB-01–DB-04, INFRA-07 | Authorization | Isolation tests; no client override |
| B4-02 | Implement BYOI onboarding/binding/rotation/revocation and per-tenant credential isolation | INFRA-01, DB-11 | B4-01 | Create/validate/bind/unbind/rotate/revoke tests |
| B4-03 | Implement `projects` split and `documents` ownership migration with shadow/reconciliation/rollback | DB-03, DB-04, DB-08 | B4-01; migration approval | Migration/rollback/reconciliation evidence |
| B4-04 | Implement Platform-Managed pool, metering/billing, queue/concurrency/capacity, disabled “Coming Soon” mode | INFRA-02–INFRA-06 | B4-01 | Mode-disabled, metering, capacity tests |
| B4-05 | Implement independent GPU/CPU selection in both modes | INFRA-03 | B4-02, B4-04 | Selection matrix tests |
| B4-06 | Implement Owner Admin Dashboard controls for providers/models/infrastructure/modes/approvals/audit | INFRA-05 | B4-02, B4-04 | Owner-only, masked-secret, audit tests |
| B4-07 | Implement secondary database/replication checks and safe failover rules | PROV-06, PROV-14 | B4-03 | Replication/failover tests |
| B4-08 | Move Android tokens to Keystore; disable/exclude backup; add migration/revocation tests | AUTH-05, AUTH-06 | Android auth implementation | Security/backup/migration/logout tests |
| B4-09 | Implement draggable chat bubble: persistence, snapping, safe areas, accessibility, non-interference | AND-01–AND-03 | Android UI work | Drag/persistence/rotation/accessibility tests |
| B4-10 | Complete Owner screens and Platform-Managed disabled behavior | AND-04 | B4-04, B4-06 | UI/control tests |
| B4-11 | Implement versioned encryption registry, rotation/re-encryption/recovery, KMS-ready custody | DB-09, DB-10 | B4-03 | Key-version/rotation/recovery tests |
| B4-12 | Verify quotas, budget, audit, server-side Owner/admin gating | GOV-01 | B1-03 | Quota/audit/role tests |
| B4-13 | Recover/verify existing AWS runtime against the Owner checklist; no recreation | TEST-08 | AWS access | Completed checklist; evidence or BLOCKED |
| B4-14 | Run all 14 workflows in isolated n8n runtime | N8N-06 | B2-10; isolated n8n | WF-00–WF-13 runtime evidence |
| B4-15 | Run full isolated E2E: Android → backend → DB → n8n → workers → storage → playback | TEST-07 | B4-08–B4-14 | E2E trace; callbacks; media; DB rows |
| B4-16 | Complete manual accessibility, device/tablet testing, APK verification | AND-05–AND-07 | Device/emulator | Manual record; APK artifact |
| B4-17 | Run full regression with fresh exit-gate evidence | TEST-01, TEST-11 | B4-01–B4-16 | Fresh Android/backend/worker/n8n evidence |
| B4-18 | Owner practical testing, defect correction, explicit acceptance | TEST-09, TEST-10 | B4-17 | Owner test record; acceptance/rejection |
| B4-19 | Record OD-14 Stage 5 scope decision only after acceptance | GOV-09 | B4-18 | Decision record |
| B4-20 | Production deployment only with separate explicit OD-15 go-ahead | GOV-10 | B4-19 | Separate approval record |

### Exit Criteria

- [ ] BYOI is implemented and isolation-tested, or explicitly deferred with no completion claim.
- [ ] Tenant resolution is fail-closed; no client override can change tenant identity.
- [ ] BYOI onboarding/binding/rotation/revocation pass.
- [ ] `projects` split and `documents` ownership migration pass with rollback/reconciliation.
- [ ] Platform-Managed mode is fully implemented, disabled, and displays “Coming Soon.”
- [ ] Metering/billing/queue/capacity controls work.
- [ ] Owner dashboard controls work and secrets are masked.
- [ ] Secondary database replication/failover checks work; no blind failover.
- [ ] Android tokens are Keystore-backed; backup excludes tokens; migration/logout pass.
- [ ] Draggable bubble works across screens, rotations, safe areas, and accessibility checks.
- [ ] Encryption keys are versioned; rotation/recovery pass.
- [ ] Quotas, budget, audit, and server-side Owner/admin gating pass.
- [ ] AWS runtime is recovered and verified, or explicitly remains BLOCKED.
- [ ] All 14 workflows run in isolated n8n; no WF-14 exists.
- [ ] Full isolated E2E passes.
- [ ] Manual accessibility and device/tablet acceptance pass, or are explicitly not claimed.
- [ ] Full regression passes with fresh evidence.
- [ ] Owner explicitly accepts or rejects the complete system.
- [ ] OD-14 is recorded after acceptance; Stage 5 remains blocked until then.
- [ ] No production action occurs without separate OD-15 approval.

## 10. Requirement Traceability

The complete matrix is `COMPLETE_OWNER_REQUIREMENTS_TRACEABILITY_MATRIX.md`.

| Requirement family | Mapped rows | Current planning position |
|---|---:|---|
| Governance and constraints | 10 | Mostly satisfied constraints; complete system not built |
| Authentication and session | 10 | Login/auth replacement is the first critical blocker |
| Database and key lifecycle | 11 | Isolated DB, migrations, BYOD, and key versioning open |
| Prompt Studio and library | 17 | Full library is mandatory; current implementation broken/partial |
| Providers, models, fallback | 14 | Mostly not implemented; primary blocker for media |
| BYOI/Platform-Managed/Owner | 8 | Partial config only; full implementation required |
| Memory and low-TPM | 6 | Placeholder memory; low-TPM partial |
| Android completion | 7 | Bubble, Keystore, manual accessibility, device testing open |
| Workflow reliability | 6 | 14 workflows preserved; callbacks/WF-02→WF-03/runtime open |
| Verification, AWS, acceptance | 12 | Runtime/E2E/AWS/Owner acceptance blocked |
| **Total** | **101** | **15 PASS, 34 PARTIAL, 38 NOT IMPLEMENTED, 8 BLOCKED, 6 NOT TESTED** |

## 11. Existing Test Evidence and Non-Repeat List

Inherited results must not be rerun merely to claim a new PASS. Re-run at a batch exit gate or when code/configuration/environment changes.

| Evidence | Scope | Result | Reuse rule |
|---|---|---|---|
| Android CI `42577400016` at `44bfa15` | JVM, instrumentation, control suite, Maestro, lint | 20/20, 116/116, 35/35, 2/2, 0 errors | Inherit automated scope |
| Backend CI `42458161277` at `c6fc398` | Unit/routes/static/regression | 36/60/27/19 PASS; 4 DB skipped | Inherit automated scope |
| Backend current local combined | Unit/routes/static/regression | 142/142 PASS | Fresh local evidence |
| Worker CI `42457744833` at `da069d3` | Contract tests | 5/5 PASS | Inherit contract scope |
| n8n static `2026-11-09` | 14 workflows | 14/14 PASS | Inherit static scope |
| Database static | 73 tables | 10/10 PASS | Inherit static scope |
| Telegram proxy | 8 tests | PASS | Inherit mocked scope |
| Multi-user authorization | 60 route tests | PASS | Inherit route scope |
| Accessibility automated | 5 tests | 5/5 PASS | Inherit automated scope |
| Prompt Studio UI | Instrumentation/control suite | PASS | UI only; persistence FAIL |
| 12 master reports `78949e7` | Documentation | Pushed | Inherit evidence baseline |
| Preliminary roadmap `98ffc0d` | Documentation | Pushed | Superseded by this revision |

Non-repeat rules:

- Fake-repository UI tests are not backend persistence proof.
- Mocked Telegram tests are not live storage proof.
- n8n static validation is not runtime proof.
- Worker contract tests are not TTS/FFmpeg runtime proof.
- Static schema contracts are not database integration proof.
- Component passes are not E2E proof.
- Historical failures remain history, not current acceptance evidence.

## 12. Blockers and Dependencies

| Blocker / dependency | Blocks | Required resolution |
|---|---|---|
| Implementation not authorized | All batches | Separate Owner authorization |
| Login `503` | B1, all runtime E2E | Implement approved Supabase Auth |
| Isolated test database unavailable | B1, B2, B4 | Provision OD-13 test project |
| Disposable n8n unavailable | B1, B2, B4 | Provision isolated n8n |
| Workflow changes not approved | B1-06, B2-10 | Explicit approval for existing-workflow changes |
| GPU repository/runtime absent | B3 | Provide GPU source/runtime/credentials |
| Provider credentials absent | B3 | Provide isolated Groq/Gemini/NVIDIA test credentials |
| Telegram bot/storage absent | B3 | Provide isolated test bot/chat |
| Worker signed auth not implemented | B3 | Implement OD-09 |
| Android Keystore/backup defects | B4 | Implement OD-11 |
| Encryption key lifecycle not implemented | B4 | Implement OD-12A/12B |
| BYOD not implemented | B4 | Implement tenant resolver/onboarding |
| Platform-Managed mode not implemented | B4 | Implement OD-05 pool/metering/controls |
| Manual accessibility/device unavailable | B4 | Provide device/emulator and session |
| AWS access/logs absent | B1-08, B4-13 | Owner-provided read-only access or approved verification environment |
| OD-14 open | Stage 5 | Owner decision after acceptance |
| Production approval not granted | Production | Separate OD-15 go-ahead |

## 13. Permanent Progress Register

Update only with verified evidence. Do not mark PASS from intent.

### Baseline Register

| ID | Item | Status | Evidence / note |
|---|---|---|---|
| C-01 | Android automated scope | PASS | CI `42577400016`; conditional acceptance |
| C-02 | Backend build/safe/regression | PASS | CI `42458161277`; local 142/142 |
| C-03 | CPU worker contracts | PASS | CI `42457744833`; 5/5 |
| C-04 | n8n static validation | PASS | 14/14; runtime BLOCKED |
| C-05 | Database static contract | PASS | 10/10; 73 tables; integration BLOCKED |
| C-06 | Telegram proxy/security | PASS | 8 mocked tests; live BLOCKED |
| C-07 | Multi-user project authorization | PASS | 60 route tests; BYOD NOT IMPLEMENTED |
| C-08 | Accessibility automated | PASS | 5/5; manual NOT TESTED |
| C-09 | Full system acceptance | BLOCKED | `FINAL_SYSTEM_ACCEPTANCE_REPORT.md` |
| C-10 | AWS runtime recovery | BLOCKED | No access/logs |
| C-11 | Implementation authorization | NOT AUTHORIZED | Planning task only |

### Batch Register

| ID | Batch | Work item | Status | Evidence / blocker |
|---|---|---|---|---|
| B1-01 | 1 | Supabase Auth/JWT/session | NOT IMPLEMENTED | Login `503` |
| B1-02 | 1 | Project creation/routes/zero-UUID | PARTIAL | App zero UUID removed; route/runtime unverified |
| B1-03 | 1 | Schema/migration alignment | PARTIAL | Drift remains; no isolated DB |
| B1-04 | 1 | Ownership end to end | PARTIAL | Guard passes; `getProject`/list fallback remain |
| B1-05 | 1 | Outbox/idempotency/terminal state | PARTIAL | Unit/route only; runtime BLOCKED |
| B1-06 | 1 | Callback/error/reconciliation | NOT IMPLEMENTED | No callback/error nodes |
| B1-07 | 1 | `config_encrypted` hydration | PARTIAL | Infrastructure fixed; commands still `config` |
| B1-08 | 1 | AWS recovery inventory | BLOCKED | No AWS access |
| B1-09 | 1 | Batch 1 regression | BLOCKED | Awaiting B1-01–B1-08 |
| B2-01 | 2 | Prompt category/update | NOT IMPLEMENTED | Category omitted; no update route |
| B2-02 | 2 | Project-default safety/medium | NOT IMPLEMENTED | `set_active` mutates; Android hardcodes `ANIME` |
| B2-03 | 2 | Prompt tenant isolation | NOT IMPLEMENTED | Missing user filters |
| B2-04 | 2 | Master Prompt Library | PARTIAL | Basic editor only |
| B2-05 | 2 | Search/filter/favorites/versioning | NOT IMPLEMENTED | No source surface |
| B2-06 | 2 | Multi-select/Story Bible/four surfaces | PARTIAL | Bible/creation selectors missing |
| B2-07 | 2 | Compatibility validation | NOT IMPLEMENTED | No validation |
| B2-08 | 2 | Story Bible/creative flows | NOT TESTED | UI/route only |
| B2-09 | 2 | Episode overrides | PARTIAL | Override exists; persistence incomplete |
| B2-10 | 2 | WF-02 → WF-03 | NOT IMPLEMENTED | Payload only |
| B2-11 | 2 | IMAGE prompt → image generation | PARTIAL | WF-03 ignores custom prompt |
| B2-12 | 2 | Story memory real retrieval | NOT IMPLEMENTED | Random embeddings |
| B2-13 | 2 | Chat memory/scopes/delete | PARTIAL | Local 60-message cache |
| B2-14 | 2 | Low-TPM behavior | PARTIAL | Partial limits only |
| B2-15 | 2 | Batch 2 regression | BLOCKED | Awaiting B2-01–B2-14 |
| B3-01 | 3 | Provider registry/priority | PARTIAL | Groq/Gemini config only |
| B3-02 | 3 | Model modes/task models | NOT IMPLEMENTED | No modes |
| B3-03 | 3 | Model compatibility filtering | NOT IMPLEMENTED | No filter |
| B3-04 | 3 | Universal fallback/resume | NOT IMPLEMENTED | No engine |
| B3-05 | 3 | GPU runtime | BLOCKED | No repo/runtime/credentials |
| B3-06 | 3 | Signed worker auth | NOT IMPLEMENTED | No worker auth |
| B3-07 | 3 | CPU TTS/FFmpeg runtime | NOT TESTED | Contracts only |
| B3-08 | 3 | GPU dispatch/fallback/resume | NOT TESTED | Depends B3-05 |
| B3-09 | 3 | Worker callbacks | NOT TESTED | No runtime |
| B3-10 | 3 | Live Telegram storage | BLOCKED | No bot/chat |
| B3-11 | 3 | Android media playback | NOT TESTED | No live media |
| B3-12 | 3 | Batch 3 regression | BLOCKED | Awaiting B3-01–B3-11 |
| B4-01 | 4 | Tenant resolver/registry | NOT IMPLEMENTED | No BYOD source |
| B4-02 | 4 | BYOI onboarding/credentials | NOT IMPLEMENTED | No onboarding |
| B4-03 | 4 | Projects split/documents migration | NOT IMPLEMENTED | No migration |
| B4-04 | 4 | Platform-Managed pool/metering | NOT IMPLEMENTED | No full mode |
| B4-05 | 4 | Independent GPU/CPU modes | PARTIAL | Partial config only |
| B4-06 | 4 | Owner Admin Dashboard | PARTIAL | Static/partial screens |
| B4-07 | 4 | Secondary DB/replication | NOT IMPLEMENTED | No replication |
| B4-08 | 4 | Android Keystore/backup | NOT IMPLEMENTED | Plaintext; backup enabled |
| B4-09 | 4 | Draggable chat bubble | NOT IMPLEMENTED | Fixed FAB only |
| B4-10 | 4 | Owner Android screens/Coming Soon | PARTIAL | UI only |
| B4-11 | 4 | Encryption versioning/rotation | NOT IMPLEMENTED | Single key |
| B4-12 | 4 | Quota/audit/owner gating | PARTIAL | Route tests only |
| B4-13 | 4 | AWS runtime verification | BLOCKED | No access |
| B4-14 | 4 | All 14 workflow runtime | BLOCKED | No n8n |
| B4-15 | 4 | Full isolated E2E | BLOCKED | No environment |
| B4-16 | 4 | Manual accessibility/device/APK | PARTIAL | Automated/APK pass; manual not tested |
| B4-17 | 4 | Full regression | PARTIAL | Baseline passes; fresh exit gate required |
| B4-18 | 4 | Owner acceptance | BLOCKED | No complete system |
| B4-19 | 4 | OD-14 Stage 5 decision | OPEN | Owner decision |
| B4-20 | 4 | Production OD-15 approval | BLOCKED | No separate go-ahead |

## 14. Risks and Controls

| Risk | Impact | Control |
|---|---|---|
| Declaring acceptance from component passes | Unsafe release | Batch gates and E2E evidence |
| Treating mocks/static/fake UI as runtime proof | False confidence | Status definitions and non-repeat rules |
| Starting BYOD before foundation is stable | Compounding defects | Strict batch order |
| Modifying frozen workflows | Governance violation | 14-workflow rule; explicit approval |
| Recreating AWS instead of recovering | Duplicate/unsafe deployment | Read-only inventory first |
| Migration drift/data loss | Broken deployment | Replay/rollback before data movement |
| Secret leakage | Security exposure | No-secrets rule; scan before commit |
| Login bypass | Authentication failure | No password bypass; Supabase Auth only |
| GPU unavailable but labeled ready | False readiness | GPU-specific evidence; no substitute PASS |
| Prompt Studio deferred | Missing Owner requirement | Full scope in Batch 2 |
| OD-14 started early | Stage gate violation | Stage 5 remains blocked |

## 15. Next-Session Instruction

1. Read this roadmap, the traceability matrix, the reconciliation report, and the AWS checklist.
2. Confirm implementation authorization and isolated-environment approval.
3. If authorization or environments are missing, keep work `BLOCKED`; do not implement around it.
4. Start with B1-01 only after authorization.
5. Before editing, provide proposed changes and affected files as required by `AGENTS.md`.
6. After each work item, run relevant build/tests, record exact evidence, and update the register.
7. Do not start Batch 2, 3, or 4 until the preceding exit gate passes.
8. Do not modify workflows, contact production, rotate credentials, or move BYOD data without explicit approval.
9. Do not start Stage 5 while OD-14 is open.
10. Do not claim full acceptance before Owner practical testing and explicit acceptance.

## 16. Evidence Index

- `UNIFIED_AUDIT_REPORT_INVENTORY.md`
- `UNIFIED_EVIDENCE_RECONCILIATION_REPORT.md`
- `COMPLETE_OWNER_REQUIREMENTS_TRACEABILITY_MATRIX.md`
- `AWS_OWNER_RUNTIME_RECOVERY_CHECKLIST.md`
- `MASTER_READINESS_AND_BLOCKERS_REPORT.md`
- `FINAL_PLANNING_REVIEW.md`
- `docs/contracts/OWNER_DECISION_REGISTER.md`
- `docs/contracts/MASTER_IMPLEMENTATION_HANDOFF.md`
- `docs/contracts/MASTER_ACCEPTANCE_MATRIX.md`
- `docs/contracts/P0_SECURITY_REMEDIATION_FINAL.md`
- `PROMPT_STUDIO_AUDIT_2026-11-07.md`
- `Story_database.txt`

## 17. Safety Statement

- No implementation was performed.
- No migration was executed.
- No schema was changed.
- No n8n workflow was modified or activated.
- No credential was rotated.
- No AWS or production system was contacted.
- No stage was marked complete.
- No full-system acceptance was claimed.
