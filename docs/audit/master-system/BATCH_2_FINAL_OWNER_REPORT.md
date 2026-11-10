# Batch 2 Final Owner Report

Date: 2026-11-10
Branch: `opencode/batch-2-prompt-library`
Status: **AUTOMATED SCOPE PASS — RUNTIME AND E2E GATES REMAIN BLOCKED**

## A. Executive Summary

Batch 2 source work is implemented, committed, pushed, and passing every available automated gate. The latest backend implementation cloud run passed 193 safe tests and 19 regression tests; the docs-only report commit also passed backend CI. The latest Android cloud run passed 34 JVM tests, 122 instrumentation tests, 2/2 Maestro flows, lint, the debug APK build, and the aggregate summary.

The Batch 2 Git-verifiable scope is complete: genre templates and expanded media vocabulary (`B2-04`), Story Bible shared prompt-library access (`B2-06`), WF-02 episode prompt override resolution (`B2-09`), semantic-retrieval/fallback/isolation coverage (`B2-12`), and Android local/server memory reconciliation (`B2-13`) are all implemented and covered.

Batch 2 is still not fully closed. Isolated database replay/RLS, disposable n8n runtime dispatch, physical-device behavior, and integrated Android → backend → DB → n8n → worker → storage evidence remain `BLOCKED` or `NOT TESTED`. No production system was touched. No workflow was imported, activated, or deployed. No PR was merged.

## B. Scope and Authority

Completed only the authorized Batch 2 creative-pipeline scope: prompt library CRUD/update/search/filter/favorite/versioning, genre/format/media organization, tenant-scoped active prompt lookup, project prompt association, Story Bible prompt access, IMAGE and episode prompt dispatch, memory correctness, low-TPM behavior, WF-02 → WF-03 composition, and Android Prompt Studio plus local/server memory reconciliation.

Not performed: Batch 3–4 work, production deployment, production database/n8n/AWS/Telegram changes, credential rotation, destructive database operations, new workflows (`WF-14` was not created), PR merges, or AI Assistant App changes.

## C. Recovered and Completed Work

- Additive Batch 2 migration and rollback for prompt category, genre, format, model hint, tags, favorite/archive flags, versioning, project associations, and nullable memory embeddings.
- Prompt PATCH, favorite toggle, version history, compatibility validation, tenant/project/category filters, and search.
- Prompt save no longer mutates project visual medium; only the active system prompt association changes.
- Prompt library metadata now exposes the required genres (`HORROR`, `THRILLER`, `ROMANCE`, `COMEDY`, `ACTION`, `MYTHOLOGY`) and expanded media vocabulary (`ANIME`, `REAL_HUMAN`, `LIVE_ACTION`, `CINEMATIC`, `MANHWA`, `3D`, `HYBRID`), plus reusable genre templates.
- Compatibility rules now cover thriller, romance, and mythology combinations while retaining the existing medium/model checks.
- Project creation accepts selected prompt IDs, writes `project_prompt_associations`, and activates the selected Bible prompt.
- Story Bible exposes a shared prompt-library card that loads BIBLE prompts, associates the selected prompt, and activates it for the project.
- Command hydration resolves tenant-scoped BIBLE and IMAGE prompts; IMAGE prompt config reaches the outbound command payload.
- WF-02 dispatch resolves an owned, non-archived episode `EPISODE` override at the episode dispatch boundary, reports the resolved prompt identity in the payload, and falls back to the project Bible prompt when the override is missing, invalid, archived, or cross-tenant. Non-episode workflows ignore stored episode overrides.
- WF-02 dispatches the approved scene plan to WF-03 through `executeWorkflow`.
- WF-03 composes the IMAGE system prompt into scene visual prompts.
- Memory routes now support owner-scoped read, deduplicated write, correction, deletion, and reconciliation.
- Real Gemini embedding calls with lexical and recency fallback; random story embeddings were removed.
- Low-TPM token budgeting, exponential backoff with jitter, `Retry-After`/rate-limit reset parsing, and retry-storm prevention.
- Android Prompt Studio now supports search, favorites, medium selection, genre/format cycling, genre-template application, genre/format compatibility filtering, update-instead-of-duplicate save, and project-creation prompt multi-select.
- Android Story Bible now supports shared prompt-library access, association, and activation.
- Android memory reconciliation now has stable local/server identifiers, tombstones, pending-upload preservation, deduplication, and AI Brain load-time reconciliation with upload of pending local messages.
- Added focused tests for genre templates, episode override resolution/fallback, semantic retrieval and fallback isolation, Android reconciliation, Prompt Studio genre templates, and Story Bible prompt association.

## D. Commits, Pull Requests, and Artifacts

| Repository | Branch | Branch head | PR |
|---|---|---|---|
| Backend | `opencode/batch-2-prompt-library` | `04ab789d08a9fd5ed86229f56a2004babdd7d90c` | `https://github.com/bnaisolution/ai-anime-backend/pull/2` |
| Android | `opencode/batch-2-prompt-library` | `e26890d6e406206eda07552ca906e4ba8718a1ec` | `https://github.com/bnaisolution/ai-anime-android/pull/2` |
| Worker | `main` | `da069d3bb30d2389992cc8de82a9b5bad1e31eea` (unchanged) | Unchanged |

Both PRs target `opencode/batch-1-foundation`, remain open, and report merge state `CLEAN`. They were not merged.

CI checked out merge/PR refs rather than only branch heads:

| CI checkout | SHA |
|---|---|
| Backend merge ref | `f8782f775b39db1d3d22df0fdc5f166766423137` |
| Android PR head | `e26890d6e406206eda07552ca906e4ba8718a1ec` |
| Worker sibling | `da069d3bb30d2389992cc8de82a9b5bad1e31eea` |
| Sibling ref | `main` |

Batch 2 implementation commits:

- Android `28b6350`: prompt library genre/format/media UI, genre templates, Story Bible prompt card, memory API/repository, `MemoryReconciler`, `MemoryCoordinator`, and focused JVM/instrumentation coverage.
- Android `1fe093e`: restored the full prompt medium label and split the Prompt Studio control rows to avoid layout overflow.
- Android `e26890d`: reconciled project memory on AI Brain load and uploaded pending local messages.
- Backend `04ab789`: genre templates, expanded media vocabulary, episode prompt override resolution, `active_system_prompt_id` in Story Bible reads, and focused B2-04/B2-09/B2-12 tests.
- Backend report commit: this document.

Prior Batch 2 commits retained: Android `18cb6d8`, `c04a1a3`, `c1ec601`, `74edcb2`, `9970d31`; backend `a6ff09e`, `3aa3402`, `4650c62`, `3a5d91c`, `ca8a6a7`, `b377aeb`.

## E. Test and CI Evidence

| Check | Evidence | Result |
|---|---|---|
| Backend build | Local `npm run build` | PASS |
| Backend report CI | CI run `42743302502` | PASS |
| Backend unit | CI run `42739292401` | PASS — 67 |
| Backend routes | CI run `42739292401` | PASS — 81 |
| Backend static local | CI run `42739292401` | PASS — 37 |
| Backend static cross-repo | CI run `42739292401` | PASS — 8 |
| Backend safe total | CI run `42739292401` | PASS — 193 |
| Backend regression | CI run `42739292401` | PASS — 19 |
| Backend DB integration | CI run `42739292401` | BLOCKED — `RUN_DB_TESTS` not enabled |
| Android JVM | CI run `42741262909` | PASS — 34 |
| Android instrumentation | CI run `42741262909` | PASS — 122 |
| Android Maestro | CI run `42741262909` | PASS — 2/2 |
| Android lint | CI run `42741262909` | PASS |
| Android debug APK | CI run `42741262909` | PASS |
| Android summary | CI run `42741262909` | PASS |
| n8n static contracts | Backend static CI | PASS — 14/14 canonical workflows |

Local targeted backend suites also passed: genre templates 4/4, prompt resolution 4/4, semantic retrieval 4/4, static siblings 8/8, regression 19/19.

Android instrumentation includes the two new Batch 2 tests for genre-template application and Story Bible prompt association. The earlier Android run `42739275242` failed one existing instrumentation test because the medium label was shortened to `M:` while the assertion expected `Medium: REAL_HUMAN`; Maestro also failed that run on a transient Gradle plugin-resolution error. Commit `1fe093e` restored the full label and safe layout, and run `42741262909` is fully green.

## F. Database Migration and Rollback

Source is hardened but not live-replayed.

- Migration: `supabase/migrations/003_batch2_prompt_library.sql`
- Rollback: `supabase/migrations/003_batch2_prompt_library_rollback.sql`
- Migration and rollback are additive and replay-safe where applicable.
- Prompt version snapshot trigger is created and removed symmetrically.
- Project prompt associations and prompt versions have service-role RLS policies.
- `memory_knowledge.embedding` is nullable in the migration and restored to `NOT NULL` in rollback.
- Static migration alignment tests pass.
- Isolated migration replay, rollback replay, live schema equality, and RLS validation remain `BLOCKED`.

## G. n8n and Worker Reliability

- All 14 canonical workflows remain present and statically validated.
- `WF-14` was not created.
- Only two canonical workflow JSON files changed:
  - `n8n-workflows/storywf02.json` adds the approved `executeWorkflow` edge to WF-03.
  - `n8n-workflows/storywf03.json` composes `image_system_prompt` into scene visual prompts.
- No workflow was imported, activated, or executed in a disposable n8n runtime.
- WF-02 → WF-03 dispatch, episode override propagation, and IMAGE prompt usage are proven by static and unit contract tests only; runtime evidence is `BLOCKED`.
- The CPU worker was not modified and no worker runtime was executed.

## H. Security, Ownership, and Auth

- Prompt list, PATCH, favorite, version, and association queries are scoped to the authenticated user.
- Genre-template metadata is static and contains no tenant data.
- Memory read, write, correction, deletion, and reconciliation are scoped to the authenticated owner.
- Episode prompt overrides require an owned project, an owned non-archived `EPISODE` prompt, and the WF-02 episode dispatch boundary.
- Prompt save cannot change project visual medium or project default medium.
- Command hydration never forwards plaintext infrastructure config; provider secrets remain encrypted at rest.
- Project creation associations are written only for the authenticated owner.
- Android memory reconciliation keys uploads by stable message identifiers and preserves local pending messages when server sync fails.
- Residual risk: command/outbox payloads still carry provider configuration for n8n delivery; API responses are redacted, but at-rest TTL/redaction remains a later batch requirement.

## I. Batch 2 Work Item Status

| ID | Status | Evidence / Gap |
|---|---|---|
| B2-01 | PASS | Prompt category persistence, PATCH route, Android update path, route tests |
| B2-02 | PASS | Project medium unchanged test; Android sends selected medium |
| B2-03 | PASS | Tenant/project/category filters and command hydration tests |
| B2-04 | PASS | Genre templates, required genres, expanded media/format vocabulary, Prompt Studio genre/format/template UI, persistence, route and instrumentation tests |
| B2-05 | PASS | Search/filter/favorite/versioning routes and tests |
| B2-06 | PASS | Creation multi-select, Story Bible shared prompt-library card, association and activation, instrumentation coverage |
| B2-07 | PASS | Positive/negative medium/model compatibility tests, including genre compatibility |
| B2-08 | PASS | Source-level routes/contracts/static tests pass; isolated WF-01/04/06/09 runtime runs remain `BLOCKED` |
| B2-09 | PASS | Owned WF-02 episode override resolution, payload identity, fallback, non-episode ignore, and unit tests |
| B2-10 | PASS | WF-02 → WF-03 static edge and contract test pass; disposable runtime dispatch remains `BLOCKED` |
| B2-11 | PASS | IMAGE prompt hydration and WF-03 composition tests pass; runtime generation not executed |
| B2-12 | PASS | Real embedding path, write vector scoping, lexical/recency fallback, and tenant/project isolation tests |
| B2-13 | PASS | Android stable-ID reconciliation, tombstones, pending upload, AI Brain integration, JVM tests, and instrumentation coverage |
| B2-14 | PASS | Budget, backoff/jitter, header parsing, retry-storm tests |
| B2-15 | PASS | Safe 193 and regression 19 suites pass; DB integration and integrated E2E remain `BLOCKED` |

## J. Blockers and Unverified Areas

| Blocker | Impact |
|---|---|
| No isolated Supabase project | Migration replay, rollback replay, RLS, DB integration, and cross-user DB tests `BLOCKED` |
| No disposable n8n runtime | WF-02 → WF-03 dispatch, episode override runtime, callback, and error-path tests `BLOCKED` |
| No physical Android device | Device behavior `NOT TESTED`; evidence is JVM/emulator only |
| No integrated environment | Android → backend → DB → n8n → worker → storage E2E `BLOCKED` |
| No production credentials/approval | Production DB, n8n, AWS, Telegram, deployment, and PR merge `BLOCKED` |

## K. Owner Actions and Decision

Required to close the remaining gates:

1. Provide an isolated Supabase test project and test-only service-role key.
2. Provide a disposable n8n instance with the canonical workflows for WF-02 → WF-03 runtime evidence.
3. Provide a physical-device Android run if device evidence is required.
4. Approve production deployment or PR merge if those actions are desired.

Decision: **Batch 2 automated and source-level scope PASS; Batch 2 not fully closed.** No runtime, integrated, production, or workflow-runtime pass is claimed.
