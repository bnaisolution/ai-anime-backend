# Unified Evidence Reconciliation Report

Date: 2026-11-09
Status: **RECONCILED FOR PLANNING — RUNTIME EVIDENCE STILL BLOCKED**
Scope: Reconciles the 12 master reports, local contracts/testing documents, current source, Git history, CI runs, and schema snapshot. No implementation or production action was performed.

## 1. Purpose

This report resolves conflicting claims across the audit corpus and establishes the evidence hierarchy used by the readiness report, traceability matrix, and roadmap.

It answers four questions:

1. Which document is authoritative when documents disagree?
2. Which findings are current, historical, or superseded?
3. Which source defects remain after the latest remediation?
4. Which requirements cannot be verified with the available evidence?

## 2. Evidence Hierarchy

When sources conflict, use this order:

| Priority | Source | Use |
|---:|---|---|
| 1 | `OWNER_DECISION_REGISTER.md` | Owner-approved scope, status, and constraints |
| 2 | `MASTER_IMPLEMENTATION_HANDOFF.md` | Consolidated implementation requirements under the register |
| 3 | Current source code and current schema snapshot | What the system currently does |
| 4 | Current CI runs and current test artifacts | What was actually executed |
| 5 | 2026-11-09 master reports | Reconciled audit conclusions |
| 6 | 2026-11-07 contracts and Stage 4.2 status | Historical planning and historical failures |
| 7 | `PROJECT_STATE.md` | Stale historical context only; not authoritative |

Rules:

- An approved decision is not “open” merely because an older contract still describes it as an option.
- A historical failure count is not current evidence after the relevant fix has run.
- A static or mocked test does not prove runtime behavior.
- A source inspection can prove a defect exists; it cannot prove runtime behavior works.
- Missing evidence is `BLOCKED` or `NOT TESTED`, never `PASS`.

## 3. Owner Decision Reconciliation

### 3.1 Decision status

The decision register is authoritative:

| Decision | Status | Reconciliation |
|---|---|---|
| OD-01 | APPROVED | Stage 4.2 closure requires complete implementation, APK, Owner testing, defect correction, explicit acceptance |
| OD-02 | APPROVED | Preserve historical 19 and 16; current baseline is 19/19 regression and 123/123 safe |
| OD-03 | APPROVED | Supabase Auth primary; backend JWT verification; Keystore tokens |
| OD-04 | APPROVED | Complete system, not partial release; Owner acceptance required |
| OD-05 | APPROVED | Hybrid SaaS; BYOI first; Platform-Managed implemented but disabled until Owner launch approval |
| OD-06 | APPROVED | Backend-controlled access boundary; 14 workflows unchanged; normal chat direct to provider |
| OD-07 | APPROVED | User-owned database is source of truth for content; platform keeps control/audit metadata |
| OD-08 | APPROVED | Strict backend-side database credential security |
| OD-09 | APPROVED | Signed, short-lived, job-scoped worker authorization |
| OD-10 | APPROVED | Versioned migrations, isolated validation, rollback authority |
| OD-11 | APPROVED | Android Keystore storage and backup exclusion |
| OD-12A | APPROVED | Versioned encryption key registry and safe rotation |
| OD-12B | APPROVED | Hybrid key custody; root key outside database |
| OD-13 | APPROVED | Isolated test database, n8n, workers, and test-only credentials |
| OD-14 | **OPEN** | Stage 5 must not start automatically or in parallel |
| OD-15 | APPROVED | Production approval boundary only; separate explicit go-ahead required |
| OD-16 | APPROVED | All A–G provider/model/fallback requirements approved |

### 3.2 Corrected OD-06 label

Some earlier documents label OD-06 as “n8n strategy.” That is incorrect.

**OD-06 is “Backend-controlled access boundary.”** Its approved scope includes:

- backend as sole authorized intermediary;
- server-side authentication and authorization;
- scoped n8n task payloads/capabilities;
- no broad user database credentials in n8n;
- normal Chat AI direct from backend to provider;
- BYOI credentials backend-side only;
- exactly 14 canonical workflows preserved.

The roadmap must not use OD-06 as an undecided workflow-strategy decision. Any workflow change remains separately gated by the frozen-workflow rule and explicit Owner approval.

### 3.3 “Approved” does not mean “implemented”

All decisions except OD-14 are approved, but the planning task does not authorize implementation. Implementation requires a separate authorization. The roadmap therefore uses:

- `APPROVED` for the decision;
- `NOT AUTHORIZED` for implementation;
- `BLOCKED` for work requiring missing environments or credentials.

## 4. Status and Stage Reconciliation

| Claim | Source | Reconciliation |
|---|---|---|
| `PROJECT_STATE.md` says Stage 2 | Local file | **STALE.** Do not edit or use as current stage truth |
| Owner says Stage 4 | Owner decisions/handoff | Use for planning context only; does not close Stage 4 |
| Stage 4.2 is complete | None | **False.** Not closed; P0 and runtime gates remain open |
| Stage 4.2 had 16 failures | 2026-11-07 status | **Historical.** Current regression run is 19/19 PASS |
| Stage 3 had 19 failures | Stage 3 results | **Historical baseline.** Preserve; not current |
| Safe suites are 123/123 | Current CI/report | Current and verified |
| Android automated scope passes | CI `42577400016` | Current and verified for automated scope only |
| Full system is accepted | None | **False.** Full system is not accepted |
| BYOD is implemented | None | **False.** BYOD is not implemented |
| Prompt Studio is complete | None | **False.** Partial and broken |
| AWS runtime is healthy | None | **Unknown/blocked.** No AWS access or logs |

## 5. Report Conflict Register

| ID | Conflict | Current resolution | Impact |
|---|---|---|---|
| RC-01 | Old roadmap says OD-03/06/09/11/12 are undecided | Decision register says all are APPROVED except OD-14 | Roadmap must not block on decisions |
| RC-02 | Old roadmap says 16 current regression failures | Current run is 19/19 PASS | Do not repeat 16 as current |
| RC-03 | Acceptance matrix says baseline “NOT ACCEPTED” | 2026-11-09 update retains history and records current evidence | Use update, not old rows |
| RC-04 | P0 final says worker dependencies unpinned | `requirements.txt` now uses exact pins | Old finding superseded |
| RC-05 | Stage 4.2 says Android zero UUID remains | No zero UUID in `app/src/main`; only shell scripts | App runtime fixed; report stale |
| RC-06 | Reports say `config_encrypted` hydration is broken everywhere | Infrastructure service uses `config_encrypted`; commands service still uses `config` | Partially fixed; command path still broken |
| RC-07 | Reports say project detail authorization is broken | `getProject(projectId, userId)` signature exists but ignores `userId` | Still broken |
| RC-08 | Reports say `listProjects` has arbitrary fallback | Fallback remains | Still a risk |
| RC-09 | Reports say Prompt Studio full scope may be deferred | Handoff and Owner requirements make full library mandatory | Must not defer |
| RC-10 | Old roadmap labels OD-06 as n8n strategy | OD-06 is backend-controlled access boundary | Correct label required |
| RC-11 | BYOD architecture says OD-05 is unselected A–E | OD-05 approved hybrid model | Architecture wording stale |
| RC-12 | BYOD migration plan treats decisions as open | Decisions approved; implementation not authorized | Update planning assumption |
| RC-13 | AWS E2E report says existing AWS work must be recovered | No AWS access available | Recovery remains blocked |
| RC-14 | Reports say n8n runtime is blocked | No disposable n8n exists | Still blocked |
| RC-15 | Reports say login `503` blocks E2E | Login still returns `503` | Still blocked |

## 6. Current Source Verification

### 6.1 Confirmed current defects

| ID | Defect | Current evidence | Severity |
|---|---|---|---|
| SRC-01 | Password login disabled | `auth.routes.ts` returns `503 AUTH_NOT_CONFIGURED` | Critical blocker |
| SRC-02 | Project detail ignores user | `getProject()` does not filter by `userId` | High |
| SRC-03 | Project list legacy fallback | Returns arbitrary projects when user owns none | High |
| SRC-04 | Command infrastructure reads `config` | `commands.service.ts` selects `config`, not `config_encrypted` | High |
| SRC-05 | Prompt category not persisted | `CreatePromptBody` and insert omit `prompt_category` | High |
| SRC-06 | Prompt save mutates project defaults | `set_active` updates `visual_medium` and `active_system_prompt_id` | High |
| SRC-07 | Android hardcodes prompt medium | `PromptStudioScreen` sends `visualMedium = "ANIME"` | High |
| SRC-08 | Prompt pre-validation lacks user filter | `index.ts` uses project/null filter only | Critical isolation |
| SRC-09 | Active prompt lookup lacks user filter | `commands.service.ts` filters by ID only | High isolation |
| SRC-10 | No prompt update route | Edits create new rows | Medium |
| SRC-11 | No prompt versioning/search/favorites/genres | No source implementation | High scope gap |
| SRC-12 | WF-02 does not invoke WF-03 | Payload only; no execution edge | High pipeline gap |
| SRC-13 | No workflow callbacks/error handling | No callback, `stopAndError`, or `errorWorkflow` node | High reliability gap |
| SRC-14 | Worker endpoints unauthenticated | No signed job authorization | Critical |
| SRC-15 | Android token storage plaintext | `SharedPreferences` | Critical |
| SRC-16 | Android backup enabled | `allowBackup="true"` | High |
| SRC-17 | Encryption key single/versionless | No key ID/registry/rotation | High |
| SRC-18 | Story memory uses random embeddings | `memory.service.ts` generates random embeddings | High |
| SRC-19 | Normal chat project fallback | Hardcoded/default project fallback risk | High |
| SRC-20 | n8n deploy/test endpoints can mutate workflows | Frozen-workflow conflict | High governance |
| SRC-21 | No draggable chat bubble | Fixed FAB only | Medium |
| SRC-22 | No full Provider/model/fallback system | Partial provider config only | High scope gap |
| SRC-23 | No full Owner Admin Dashboard | Static/partial owner data | High scope gap |

### 6.2 Confirmed fixes / current strengths

| ID | Control | Current evidence |
|---|---|---|
| FIX-01 | JWT secret/issuer/audience required | `env.ts` requires all three |
| FIX-02 | JWT signature/expiry/issuer/audience tests | Route tests pass |
| FIX-03 | Identity substitution rejected | Header/body/query spoof tests pass |
| FIX-04 | Null-owner project denied | Guard tests pass |
| FIX-05 | Role enforcement | Guard/route tests pass |
| FIX-06 | Callback HMAC/replay/timestamp | Unit tests pass |
| FIX-07 | Telegram proxy security | 8 route/unit tests pass |
| FIX-08 | Worker dependencies pinned | Exact pins |
| FIX-09 | Android zero UUID removed from app source | No runtime occurrence in `app/src/main` |
| FIX-10 | Infrastructure encryption service | Uses `config_encrypted` |
| FIX-11 | 14 canonical workflows preserved | 14/14 static validation |
| FIX-12 | Unique workflow IDs | 14/14 unique |
| FIX-13 | Android automated UI coverage | 20 JVM, 116 instrumentation, 2 Maestro |
| FIX-14 | Backend safe/regression suites | 123/123 safe, 19/19 regression |
| FIX-15 | Worker contract tests | 5/5 |
| FIX-16 | Database static contract | 10/10; 73 tables |

## 7. Test Evidence Reconciliation

### 7.1 Current PASS evidence

| Scope | Evidence | Classification |
|---|---|---|
| Backend build | `npm run build` / CI | PASS |
| Backend safe | 123/123 | PASS |
| Backend regression | 19/19 | PASS |
| Backend current local combined run | 142/142 across unit/routes/static/regression | PASS (fresh local run) |
| Android JVM | 20/20 | PASS |
| Android instrumentation | 116/116 | PASS |
| Android control suite | 35/35 | PASS |
| Android Maestro | 2/2 | PASS |
| Android lint | 25 findings, 0 errors | PASS (informational) |
| Worker contracts | 5/5 | PASS |
| n8n static | 14/14 | PASS (static only) |
| Database static | 10/10 | PASS (static only) |
| Telegram proxy | 8 tests | PASS (mocked only) |
| Multi-user project auth | 60 route tests | PASS (route only) |
| Accessibility automated | 5/5 | PASS (automated only) |

### 7.2 Current BLOCKED / NOT TESTED evidence

| Scope | Classification | Reason |
|---|---|---|
| Backend DB integration | BLOCKED | No isolated test database; 4 skipped |
| n8n runtime | BLOCKED | No disposable instance |
| Workflow callbacks | BLOCKED | No runtime and no callback nodes |
| CPU TTS runtime | NOT TESTED | No model execution |
| CPU FFmpeg runtime | NOT TESTED | No render execution |
| Worker auth | FAIL | No signed job-scoped auth |
| GPU runtime | BLOCKED | No repository/runtime/credentials |
| Telegram live storage | BLOCKED | No bot/chat |
| Android media playback | NOT TESTED | No live media |
| Prompt persistence E2E | BLOCKED | Login `503`, no isolated DB |
| Prompt tenant isolation | FAIL | Missing filters |
| BYOD | NOT IMPLEMENTED | No resolver/registry/onboarding |
| Manual accessibility | NOT TESTED | No device/session |
| Physical-device acceptance | NOT TESTED | No device |
| Android → AWS E2E | BLOCKED | No environment |
| AWS runtime recovery | BLOCKED | No access/logs |
| Full-system acceptance | BLOCKED | Multiple gates open |

### 7.3 Evidence that must not be reused as runtime proof

- Fake-repository Android UI tests are not backend persistence proof.
- Mocked Telegram tests are not live storage proof.
- n8n static validation is not runtime proof.
- Worker contract tests are not TTS/FFmpeg runtime proof.
- Static schema tests are not database integration proof.
- Route tests are not live multi-tenant isolation proof.
- Component PASS results are not E2E proof.
- Historical Stage 3/4.2 results are not current implementation evidence.

## 8. Requirement Scope Reconciliation

The 12 reports cover the existing system. The Owner requirements extend beyond them.

| Requirement family | Covered by 12 reports? | Additional source | Planning consequence |
|---|---|---|---|
| Auth/JWT/ownership | Partially | OD-03, handoff | Full Supabase Auth + Keystore + revocation required |
| Prompt Studio | Defects only | Handoff §19, Prompt Studio audit | Full library, genres, search, favorites, versioning, compatibility mandatory |
| Provider/model/fallback | No | OD-16, handoff §18 | Must be a full workstream, not a minor setting |
| BYOI/Platform-Managed | Architecture only | OD-05, handoff §11 | Full implementation, Platform-Managed disabled until launch approval |
| Story/Chat memory | No | Handoff §§13–14 | Real semantic memory, scopes, deletion, correction |
| Low-TPM | No | Handoff §12 | Budgets, rate limits, backoff, fallback, retry-storm prevention |
| Draggable chat bubble | No | Handoff §15 | Draggable, persisted, snapped, accessible |
| Owner dashboard | Partial | OD-05, handoff §11.3 | Provider/model/infrastructure/metering/approvals controls |
| AWS recovery | No | Owner instruction | Recover existing runtime, do not recreate; no access currently |
| Manual accessibility | No | Existing audit gap | Must be tested on device/emulator |

## 9. Reconciliation Counts

| Count | Value |
|---|---:|
| Master reports reconciled | 12 |
| Workspace audit documents inventoried | 26 |
| Workspace contract documents inventoried | 17 |
| Workspace testing documents inventoried | 10 |
| Top-level local documents inventoried | 4 |
| Backend master-system documents inventoried | 13 |
| Android narrative reports inventoried | 13 |
| Android evidence artifacts inventoried | 92 |
| Canonical workflows | 14 |
| Auxiliary workflow files | 28 |
| Live public tables in snapshot | 73 |
| Backend test files | 27 |
| Backend current local combined tests | 142/142 PASS |
| Owner decisions approved | 17 entries (OD-01–OD-13, OD-15, OD-16, including OD-12A/B) |
| Owner decisions open | 1 (OD-14) |
| Source defects confirmed current | 23 |
| Source strengths/fixes confirmed current | 16 |

## 10. Reconciliation Decision

- Current source and current CI supersede older report wording where they conflict.
- Historical failures remain preserved but are not current acceptance evidence.
- All approved decisions remain in force; implementation is still not authorized by the planning task.
- OD-14 remains open; Stage 5 is blocked.
- Full Prompt Studio, OD-16 provider/fallback, memory, low-TPM, draggable bubble, Owner dashboard, BYOD, and AWS recovery are mandatory planning scope.
- Full-system acceptance remains blocked.

## 11. Safety Statement

- No implementation, migration, workflow change, credential rotation, AWS action, or production access occurred.
- No historical report was rewritten.
- No test was represented as PASS when it was blocked, skipped, or not run.
- No stage was marked complete.
