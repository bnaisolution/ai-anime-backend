# Screen 3 — Story Bible: Cross-Stack Audit & Implementation Plan

**Date:** 2026-11-14  
**Mode:** READ-ONLY source audit (no code, schema, workflow, or production changes)  
**Scope:** Android Story Bible screen, backend API/commands, Supabase migrations, canonical StoryWF n8n workflows  
**Live status:** NOT LIVE-VERIFIED. Supabase schema/RLS, n8n runtime, backend runtime, and physical-device behaviour were not executed or queried in this task.

> **Owner summary (Hinglish):** UI skeleton aur basic save wiring maujood hai, lekin AI Expand currently unsafe hai — empty prompt bhejta hai, WF-01 Bible ko narrow schema se replace karta hai, aur command prematurely SUCCEEDED dikh sakta hai. Living Canon approval → canon extraction pipeline bhi connected nahi hai. Neeche evidence, root causes, aur approval-gated implementation sequence diya gaya hai.

---

## A. Executive Verdict

**Overall:** Screen 3 is structurally present but not production-safe. Manual draft save works at the API level. AI Expand is the highest-risk path. Prompt-library and series-settings features are partial. Living Canon is not connected end-to-end.

| Feature | Verdict | Severity | One-line reason |
|---|---|---|---|
| FEAT-001 Series-scale settings | **PARTIAL** | P1 | Backend accepts target episodes/duration/word count; Project Settings has state but no editable UI. Total seasons / episodes-per-season absent. |
| FEAT-002 Series context + SSOT | **PARTIAL** | P1 | Genre and visual medium exist in project columns and Bible JSON, but Bible can edit `genre` independently → two sources of truth. No compact series-context strip on Bible. |
| FEAT-003 Genre chip → Prompt Studio | **NOT CONNECTED** | P2 | No genre chip in Bible; `prompt_studio` route accepts no category/genre arguments. |
| FEAT-004 Brainstorm / direct-paste structuring | **PARTIAL** | P2 | AIBrain chat exists, but `BIBLE_CHAT` intent is unused by Android and has no “apply to Bible” preview. |
| FEAT-005 AI Expand | **BROKEN / UNSAFE** | **P0** | Sends empty user prompt, ignores five payload fields, and WF-01 replaces the whole `story_bible` with a 5-key object. |
| FEAT-006 Episode approval → Living Canon | **MISSING** | P1 | Approval decisions only update `approval_decisions`; no WF-09 `UPDATE_CANON` dispatch, no canon-fact extraction. |

**Top 5 blockers**

1. **P0 data loss:** AI Expand → WF-01 `Supabase: Update Master Bible` writes `story_bible: $json.bible_payload.bible`, replacing all seven UI keys with `{title, logline, world_overview, themes, tone}`.
2. **P0 false success:** WF-00 dispatches WF-01 with `waitForSubWorkflow: false`, but its response formatter defaults to `status: COMPLETED`; the outbox marks the command `SUCCEEDED` before WF-01 finishes.
3. **P0 empty AI input:** Android sends only `premise/genre/world_setting/world_rules/power_system`; backend resolves `userPrompt` only from `userPrompt/user_prompt/prompt`, so WF-01 receives an empty user input.
4. **P1 unsaved-work loss:** Project selector switches project immediately; no dirty confirmation. Back/discard reloads the server copy instead of navigating back.
5. **P1 Living Canon gap:** approvals are recorded but never converted into canon facts; Canon Viewer’s manual “Commit Fact” payload does not match WF-09’s contract.

---

## B. Scope, Constraints, and Evidence Standard

**Inspected**

- Android repo: `/home/ec2-user/ai-anime-android`
- Backend repo: `/home/ec2-user/ai-backend`
- Canonical workflows: `/home/ec2-user/ai-backend/n8n-workflows/StoryWF-00…13`
- Supabase migrations: `/home/ec2-user/ai-backend/supabase/migrations/`
- Existing audit/testing docs: `docs/audit/master-system/`, `docs/testing/screens/F2-BIBLE.md`

**Explicitly not performed**

- No source edits, migrations, Supabase reads/writes, n8n imports/edits, new workflows, new screens/APIs/tables/dependencies, commits, pushes, stashes, resets, or cleans.
- No inspection of AI Assistant or AI App Factory assets.
- No secret printing.

**Ground truth**

- Local repository HEADs were treated as authoritative.
- `docs/architecture/06_SYSTEM_LEDGER.md` is **stale**: it says Android `8909993` and backend `81e703a`; actual local heads are Android `4222d1e` and backend `cb193d3`.
- Backend working tree already had user/uncommitted changes (`AGENTS.md`, ledger, `docs/memory/`, migration runbook, `scripts/db_backup.sh`). Those were left intact; only the ledger’s F2 status line was updated with this audit’s status, and this report file was added.

**Evidence labels used below**

- **FACT** — directly visible in source/static JSON/migration.
- **INFERENCE** — derived from code paths; not executed live.
- **RECOMMENDATION** — proposed change; not implemented.

---

## C. Repository and Build Baseline

| Component | Branch / HEAD | Working tree | Notes |
|---|---|---|---|
| Android | `main` @ `4222d1e` | Clean | Includes Batch 2 Bible tests and C-15 partial wiring. |
| Backend | `main` @ `cb193d3` | Dirty (user docs) | Actual head newer than ledger. |
| CPU worker | `main` @ `ee47fdc` | Clean | Not modified. |
| n8n workflows | N/A | Static JSON only | 14 canonical files live under backend `n8n-workflows/`; no separate n8n git repo. |

**FACT:** Local Android HEAD contains `630759d` (“replace back-press discard test with unsaved-edits indicator test”), so the prior discard/back test was removed.  
**FACT:** `Batch2ControlBehaviorTest` contains dispatch-level tests for Save Draft, AI Expand, prompt association, and unsaved indicator; it does not assert persisted Bible content or WF-01 merge behaviour.

---

## D. Screen 3 UI, Navigation, and Current Behaviour

**FACT — route/entry**

- Route: `bible` (`AppNavGraph.kt:519`).
- Entry points: global drawer “STORY → Story Bible” and Project Detail “Story Bible” link.
- Screen has no ViewModel; all state lives in `BibleScreen.kt`.

**FACT — four tabs and seven fields**

Tabs (`BibleScreen.kt:43-47`, rendered at `295-303`):

1. Overview & Tone
2. World & Rules
3. Power System
4. Characters & Timeline

Fields (`BibleScreen.kt:49-55`, rendered at `305-375`):

1. Master Premise / Logline → `premise`
2. Tone & Genre → `toneGenre`
3. World Setting & Geography → `worldSetting`
4. Immutable World Rules → `worldRules`
5. Power System Rules → `powerSystem`
6. Core Cast Foundations & Factions → `characterFoundations`
7. Timeline & Season Arc → `timelineFoundation`

No duplicate Bible screen or duplicate field set was found.

**FACT — save**

- “Save Bible Draft” calls `repository.updateProjectBible(projectId, payload)`.
- Payload keys: `premise`, `genre`, `world_setting`, `world_rules`, `power_system`, `character_foundations`, `timeline` (`BibleScreen.kt:387-405`).
- Backend `PATCH /v1/anime/projects/:id/bible` merges the object into `projects.story_bible` (`lore.routes.ts:475-511`).

**FACT — dirty state and back**

- `hasUnsavedChanges = !isLoading && savedSnapshot.isNotEmpty() && currentEditorSnapshot() != savedSnapshot` (`BibleScreen.kt:81`).
- `BackHandler(enabled = hasUnsavedChanges)` opens `UnsavedChangesDialog` (`83-85`).
- “Discard” calls `loadBibleFromServer(projectId)` (`169-176`); it does **not** navigate back. The screen receives no `onBack` callback.
- If the Bible failed to load, `savedSnapshot` stays empty; edits then do not trigger the unsaved guard.

**FACT — project switch**

- `ProjectSelectorBar` writes the new project ID to local storage and invokes `onProjectChanged` directly.
- Bible handler sets `projectId = newPid` and loads the new project immediately (`BibleScreen.kt:187-190`).
- No dirty-confirmation gate exists before the switch.

**FACT — loading/error**

- `isLoading` is set but never used to render a spinner; only the unsaved guard reads it.
- `errorMessage` renders a card, but there is no explicit Retry button in the card.
- All repository errors use `e.localizedMessage`; no friendly DNS/offline mapping.

**INFERENCE**

- Physical back-button behaviour when not dirty should fall through to the global nav back arrow, but the dirty/discard path definitely stays on-screen. This matches F2-BIBLE C3 failure expectation.

---

## E. Seven-Field Data Contract and Mismatches

**FACT — UI ↔ JSON mapping**

| UI field | Read fallbacks (`hydrateFromBibleMap`) | Write key (`Save Draft`) | WF-01 output key | Result after WF-01 |
|---|---|---|---|---|
| Premise | `premise` → `logline` → `overview` | `premise` | `logline` | Partially preserved. |
| Tone & Genre | `genre` → `tone` | `genre` | `tone` | Partially preserved; can diverge from project column. |
| World Setting | `world_setting` → `world` → `setting` | `world_setting` | `world_overview` | **Not mapped** → appears blank after refresh. |
| World Rules | `world_rules` → `rules` | `world_rules` | none in `bible` (rules are top-level table input) | **Lost from Bible JSON.** |
| Power System | `power_system` → `magic_system` | `power_system` | none in `bible` (powers are top-level table input) | **Lost from Bible JSON.** |
| Characters | `character_foundations` → `main_cast_notes` | `character_foundations` | none in `bible` (characters are table input) | **Lost from Bible JSON.** |
| Timeline | `timeline` → `season_arc` | `timeline` | none | **Lost from Bible JSON.** |

**FACT — WF-01 prompt schema**

The LLM is asked for:

```json
"bible": {
  "title": "",
  "logline": "",
  "world_overview": "",
  "themes": [],
  "tone": ""
}
```

(`StoryWF-01.json:535` and fallback at `600`.)

**FACT — destructive write**

`Supabase: Update Master Bible` sends:

```json
{ "story_bible": "$json.bible_payload.bible", "current_season": "$json.current_season" }
```

to a direct Supabase `PATCH /rest/v1/projects?id=eq.<project>` (`StoryWF-01.json:703`). This replaces the entire JSON object; it does not merge.

**CONCLUSION (FACT + deterministic code path):** A successful AI Expand removes `world_setting`, `world_rules`, `power_system`, `character_foundations`, and `timeline` from `story_bible`. Because `world_overview` is not in the UI hydration fallback, World Setting also appears blank. Only premise (via `logline`) and tone/genre (via `tone`) survive partially.

**Downstream impact (FACT):** WF-02 reads `story_bible` as the “MASTER STORY BIBLE & SEASON ARC” context (`storywf02.json:418`). Losing world rules/power system/timeline degrades episode generation and continuity.

---

## F. Project Settings, Genre/Medium SSOT, and Series Scale

**FACT — project columns**

`projects` has `story_bible jsonb`, `genre text`, `visual_style text`, `auto_approve`, `budget_ceiling`, `current_season`, `current_episode` (`001_full_schema.sql:5616-5638`).  
`002_batch1_schema_alignment.sql` adds `visual_medium text` and `active_system_prompt_id uuid` (`002:16-17`).

**FACT — Project Settings UI**

`ProjectDetailScreen.kt`:

- Loads `editGenre`, `editMedium`, and series values from the overview (`173-180`).
- Has editable Genre and Visual Medium controls (`281-330`).
- Has state for `editTargetEpisodeCount`, `editEpisodeDurationMin`, `editScriptWordCount` (`93-95`).
- Saves those values only if non-null (`398-400`).
- **No input controls exist for the three series values.** They can be loaded and re-saved, but not edited.

**FACT — backend contract**

`PATCH /v1/anime/projects/:id` normalizes and stores `target_episode_count` (1–500), `episode_duration_min` (1–120), `script_word_count` (100–20,000) inside `story_bible` (`lore.routes.ts:383-391`). They are **not** real project columns.

**FACT — missing series fields**

No `total_seasons`, `episodes_per_season`, or equivalent was found in Android, backend routes, or migrations.

**FACT — SSOT conflict**

Project Settings save writes `genre` to both `projects.genre` and `story_bible.genre` (`lore.routes.ts:372-395`).  
Bible Save Draft writes `story_bible.genre` only (`PATCH /bible`).  
Therefore the Bible’s “Tone & Genre” can diverge from Project Settings. This violates the requirement that Project Settings remain the single source of truth.

**INFERENCE**

- The current Project Settings dialog may show a genre value loaded from `story_bible` even if the project column differs; the fallback chain masks divergence.

**RECOMMENDATION**

- Keep Genre and Visual Medium authoritative in Project Settings/project columns.
- Make Bible “Tone & Genre” read-only or a derived display; provide “Edit in Project Settings” rather than a second write path.
- Add series-scale inputs to Project Settings (target episodes, duration, word count, total seasons, episodes per season). Store in `story_bible` for now via existing `PATCH /projects/:id`; no new table required. If reporting/queries need columns later, add a separate approved migration.
- Show a compact read-only series-context strip on Bible (genre, medium, target episodes, duration, word count, seasons). Do not duplicate editable fields.

---

## G. Prompt Library Integration

**FACT — Bible prompt UI**

- Loads BIBLE prompts for the current project: `fetchSystemPrompts(projectId, "BIBLE")` (`BibleScreen.kt:135-138`).
- “Use” calls `associatePromptWithProject(projectId, prompt.id, "BIBLE")`, then `setActiveSystemPrompt(projectId, prompt.id)` (`BibleScreen.kt:242-247`).
- Backend list filters `project_id = current OR project_id IS NULL`, user-owned, non-archived, category `BIBLE` (`infrastructure.routes.ts:710-745`).
- Association upserts `project_prompt_associations`; activation patches `projects.active_system_prompt_id` (`infrastructure.routes.ts:750-795`, `lore.routes.ts:409-410`).

**FACT — Prompt Studio scoping**

Prompt Studio saves with `repository.currentProjectId()` (`PromptStudioScreen.kt:377`). A prompt created while project A is active gets `project_id = A`.  
After switching to project B, Bible’s list query returns only B-scoped + global prompts, so A-scoped prompts disappear. This is the most likely root cause of SB-014.

**FACT — stale list risk**

`biblePrompts` is `remember { ... }`, not keyed by project. On project change, the old list remains until the new request completes. If the new prompt request fails, `loadBiblePrompts` does nothing (`else -> {}`), leaving the previous project’s prompts visible. Clicking “Use” can then associate a prompt from the old project with the new project.

**FACT — partial activation**

Associate and activate are two separate API calls with no transaction. If associate succeeds and activation fails, the prompt is linked but not active. The UI does not roll back.

**FACT — no genre chip / deep link**

`prompt_studio` route accepts no arguments (`AppNavGraph.kt:573`). There is no Bible genre chip that opens Prompt Studio with category/genre preselected.

**RECOMMENDATION**

- Clear `biblePrompts` immediately on project switch and on load error.
- Add explicit “Project” vs “Global” scope in Prompt Studio; show a scope badge in Bible.
- Combine associate+activate into one backend operation, or compensate on failure.
- Add an optional deep link `prompt_studio?category=BIBLE&genre=<genre>`; no new screen.
- Validate that `active_system_prompt_id` belongs to the current user and is BIBLE-compatible when setting it.

---

## H. AI Expand and BIBLE_CHAT Pipeline

### H1. Android dispatch

**FACT:** AI Expand calls:

```kotlin
repository.submitStudioCommand(
  projectId = projectId,
  intent = CommandIntent.SAVE_BIBLE,
  payload = mapOf(
    "premise" to premise,
    "genre" to toneGenre,
    "world_setting" to worldSetting,
    "world_rules" to worldRules,
    "power_system" to powerSystem
  )
)
```

(`BibleScreen.kt:418-427`.)

It omits `character_foundations` and `timeline`, and it sends no `user_prompt`, `userPrompt`, or `prompt`.

### H2. Backend enrichment

**FACT:** `commands.service.ts` resolves `userPrompt` only from:

- `body.userPrompt`
- `payload.userPrompt`
- `payload.user_prompt`
- `payload.prompt`

(`commands.service.ts:318-334`.)

None are present, so `userPrompt = ''`. The five payload fields are spread into the enriched payload but are not used as AI input.

**FACT:** `SAVE_BIBLE` and `BIBLE_CHAT` both map to WF-01 (`commands.types.ts:15`). The command is persisted and dispatched asynchronously; `POST /commands` returns 202 with a command record.

### H3. n8n WF-00

**FACT:** `Dispatch: WF-01 Bible Architect` has `waitForSubWorkflow: false` (`StoryWF-00_Main_Router.json:658`).

**FACT:** `Unified Response Formatter` returns `status: currentItem.status || 'COMPLETED'` (`StoryWF-00_Main_Router.json:823`).

**FACT:** WF-00’s own success callback sends `status: "DISPATCHED"` (`StoryWF-00…:916`).

**INFERENCE:** Because the dispatch node returns no final status, the HTTP response to the backend is likely `COMPLETED`. The outbox treats `COMPLETED` as synchronous success (`outbox.dispatcher.ts:40-43`) and sets the command to `SUCCEEDED`.

### H4. n8n WF-01

**FACT:** `Normalize Trigger Input` reads `intent`, `rawText`, `userPrompt`, project/season, visual medium, and custom prompt. It does **not** read `premise`, `genre`, `world_setting`, `world_rules`, or `power_system` (`StoryWF-01.json:496`).

**FACT:** `Context Builder` sets `operationRoute = BIBLE_SAVE` when `intent === 'SAVE_BIBLE'` (`StoryWF-01.json:496`).

**FACT:** The LLM prompt contains only `title, logline, world_overview, themes, tone` under `bible` (`StoryWF-01.json:535`).

**FACT:** The LLM’s `bible` object is written directly to `story_bible` (`StoryWF-01.json:703`).

**FACT:** WF-01’s final response status is `BIBLE_SAVED` or `BIBLE_CHAT_COMPLETED`, but its backend success callback sends `status: "COMPLETED"` (`StoryWF-01.json:1275`).

### H5. Supervisor reconciliation

**FACT:** `supervisor.service.ts` early-returns if the command is already `SUCCEEDED` or `FAILED` (`line 9`). It only maps callback `SUCCEEDED`/`COMPLETED` or episode states (`line 11`); it does not understand `BIBLE_SAVED` or `BIBLE_CHAT_COMPLETED`. Once the outbox has prematurely marked `SUCCEEDED`, the later real callback is ignored.

### H6. Net effect

**FACT + INFERENCE:** AI Expand can show “completed” and refresh the Bible before WF-01 finishes. When WF-01 later runs, it replaces the Bible with a narrow object. The next refresh shows blank World Setting, World Rules, Power System, Character Foundations, and Timeline. This is both a data-loss and a false-status defect.

**FACT:** `BIBLE_CHAT` exists in the Android enum and backend mapping, but no Android screen dispatches it. `AIBrainScreen` uses the general AI chat endpoint instead. WF-01’s BIBLE_CHAT branch only returns text and audit-logs; it does not persist chat or Bible changes.

**RECOMMENDATION (no new workflow required)**

- Keep `SAVE_BIBLE` for explicit save; add a preview mode for AI Expand (e.g., `BIBLE_CHAT` + `preview_only` payload or a `mode=PREVIEW` field already supported by WF-01).
- Compose a real `user_prompt` from all seven fields, or pass a structured `bible_draft` object and teach WF-01 to merge it.
- Make WF-01 return a patch/diff, not a full replacement. Backend or workflow must merge with existing `story_bible`.
- Expand the LLM output schema to cover all seven keys, or map `world_overview`/`rules`/`powers` into the existing seven keys.
- Do not write on preview. Require explicit “Apply & Save Draft” from Android.
- Change outbox semantics: async WF-01 must remain `DISPATCHED` until a final `BIBLE_SAVED`/`BIBLE_CHAT_COMPLETED` callback.
- Teach supervisor to map `BIBLE_SAVED`/`BIBLE_CHAT_COMPLETED` to `SUCCEEDED` and to ignore `DISPATCHED`.
- Add a command timeline/status UI so the user sees queued → running → completed.

---

## I. Living Canon and Episode Approvals

**FACT — approval storage**

`approval_decisions` exists with `type`, `resource_id`, `resource_version`, `status`, `decision`, `decision_reason`, `decision_by`, `audit_event_id` (`001_full_schema.sql:4657-4679`).

**FACT — approval decision path**

`POST /v1/anime/projects/:id/approvals/:approvalId/decisions` calls `decideApproval`, which updates only `approval_decisions` and writes an audit event (`approvals.service.ts:18-25`). It does **not** dispatch WF-09, insert `canon_facts`, or update `bible_versions`.

**FACT — canon read/add**

- `GET /v1/anime/projects/:id/canon` reads `canon_facts` (`creative.service.ts:4`).
- `POST /v1/anime/projects/:id/canon` manually inserts a fact (`lore.routes.ts:811-842`).
- `GET /canon/proposals` reads `approval_decisions` filtered to CANON/pending (`lore.routes.ts:845-862`).

**FACT — WF-09 contract**

WF-09 accepts `operation_mode = UPDATE_CANON` and expects `explicit_fact_updates` or `proposed_events` (`storywf09.json:32`). It upserts `canon_facts` only when `should_mutate_db` is true (`storywf09.json:261-321`).

**FACT — Canon Viewer mismatch**

- “Commit Fact” dispatches `CHECK_CANON` with `payload = {fact, locked}` (`CanonViewerScreen.kt:94`), not `explicit_fact_updates`. WF-09 will not mutate.
- “Approve” dispatches `APPROVE_CANON_CHANGE` with `{proposal_id}` (`CanonViewerScreen.kt:303`), but WF-09 expects fact/event data, not a proposal ID. No approval record is updated and no canon mutation occurs.
- Review Inbox approval updates `approval_decisions` only (`ReviewInboxScreen.kt:73,171`).

**CONCLUSION:** FEAT-006 is not connected. “Approved” episodes do not produce canon facts. WF-09 has mutation internals but no production caller with a matching payload.

**RECOMMENDATION**

- On approval (or a separate “Promote to Canon” action), dispatch WF-09 `UPDATE_CANON` with a normalized `explicit_fact_updates` array or a `proposal_id` that WF-09 resolves server-side.
- Make the operation idempotent by `approval_id`/`request_id`; write audit and `bible_versions`/`canon_facts` in one logical flow.
- Fix Canon Viewer to call the manual canon route or the corrected WF-09 contract.
- Add a test: approve episode → canon fact exists → Bible/continuity reads reflect it.

---

## J. Backend API and Command Orchestration

**FACT — routes**

| Route | Behaviour | Evidence |
|---|---|---|
| `GET /v1/anime/projects/:id/bible` | Returns project row incl. `story_bible`, `active_system_prompt_id` | `creative.routes.ts:8`, `creative.service.ts:3` |
| `PATCH /v1/anime/projects/:id/bible` | Merges body into `story_bible` | `lore.routes.ts:475-511` |
| `PATCH /v1/anime/projects/:id` | Merges Bible JSON and updates project columns | `lore.routes.ts:358-440` |
| `POST /v1/anime/commands` | JWT + project role + idempotency; 202 + command record | Command routes/service |
| `GET /v1/anime/commands/:id` | Poll status | Command routes |
| `GET /v1/anime/prompts` | User-owned, project/global filter, category/archive filters | `infrastructure.routes.ts:710-745` |
| `POST /v1/anime/prompts/:id/associate` | Upsert project-prompt association | `infrastructure.routes.ts:883-908` |
| `POST /v1/anime/projects/:id/approvals/:approvalId/decisions` | Update approval record only | `approvals.routes.ts:11` |

**FACT — command payload**

`commands.service.ts` forwards `intent`, `userPrompt`, `visual_medium`, prompt config, project style, and the original payload to WF-00. The payload’s five Bible fields survive, but WF-01 ignores them.

**Gaps**

- No backend endpoint for “preview Bible expansion” or “apply Bible patch”.
- No merge guarantee from WF-01; workflow writes directly to Supabase.
- No transactional associate+activate.
- No approval→canon dispatch.
- No status guard preventing async workflows from being marked `SUCCEEDED` on dispatch ack.
- Manual Bible save does not create a `bible_versions` snapshot or `bible_diff_log` entry.

---

## K. Supabase Schema, Versioning, and RLS

**FACT — core table**

`projects` has `story_bible jsonb`, `genre`, `visual_style`, `current_season`, `current_episode`, `auto_approve`, `budget_ceiling`, `bible_diff_log` (`001:5616-5638`). `visual_medium` and `active_system_prompt_id` are added by `002:16-17`.

**FACT — prompt tables**

`002_batch1_schema_alignment.sql` creates `user_system_prompts`. `003_batch2_prompt_library.sql` extends it with category/genre/format/tags/version/archive and creates `prompt_versions` and `project_prompt_associations`; it enables RLS with service-role policies (`003:46-85`).

**FACT — canon/version tables**

`canon_facts` (`001:4887-4907`), `bible_versions` (`001:4832-4841`), `approval_decisions` (`001:4657-4679`), `characters`, `episodes`, `continuity_checks` exist with cascading project FKs.

**FACT — series values are JSON-only**

`target_episode_count`, `episode_duration_min`, and `script_word_count` are not columns; they live inside `story_bible` and are written by the project PATCH route.

**FACT — no season-scale columns**

No `total_seasons` / `episodes_per_season` columns or JSON keys were found.

**UNVERIFIED**

- Live Supabase schema may differ from migrations (drift).
- Live RLS policies may not match migration intent.
- Live `story_bible` JSON shapes may contain legacy keys.

**RECOMMENDATION**

- Before any migration, run a read-only schema/RLS diff against the live project.
- Do not add columns for series scale unless query/reporting requirements demand it; the existing `story_bible` JSON + project PATCH is sufficient for the UI.
- Add Bible version snapshots for manual Save Draft and Project Settings genre/medium changes, not just WF-01.
- Ensure `active_system_prompt_id` is validated for user ownership and BIBLE category.

---

## L. QA Findings and Test Coverage

### L1. Reported findings

| ID | Finding | Verdict | Evidence / root cause |
|---|---|---|---|
| SB-013 | Project switch loses unsaved edits without confirmation | **CONFIRMED (source)** | `ProjectSelectorBar` calls `onProjectChanged` directly; Bible sets new project and loads immediately (`BibleScreen.kt:187-190`). |
| SB-014 | Prompt disappears after project switch | **LIKELY / SOURCE-SUPPORTED** | Prompt Studio saves with current project ID; Bible list returns only current-project + global prompts (`infrastructure.routes.ts:721-722`). A prompt scoped to the old project disappears. Stale `biblePrompts` on load error is a secondary risk. |
| SB-015 | AI Expand does not visibly complete / can blank fields | **CONFIRMED (source)** | Empty `userPrompt`, ignored payload fields, false `COMPLETED`, WF-01 narrow schema + full replace. |
| SB-016 | Raw DNS/offline exception shown to user | **CONFIRMED (source)** | Repository catches `Exception` and uses `e.localizedMessage` for Bible/prompt calls (`AnimeRepository.kt:230-248,743-767,836-852`). |
| SB-017 | Back/discard does not navigate back | **CONFIRMED (source)** | `onDiscard` reloads server data; no `popBackStack` (`BibleScreen.kt:169-176`). |

### L2. F2-BIBLE sign-off status (source-only)

| Check | Status | Note |
|---|---|---|
| A1–A3 sections/headings/text fields | PASS (source) | Four tabs, seven fields. |
| A4 save always reachable / disabled when clean | PARTIAL | Button reachable via scroll; not sticky; not disabled when clean. |
| A5 unsaved indicator | PASS (source) | “UNSAVED EDITS” chip. |
| A6 AI Expand loading state | PARTIAL | Button disabled + status card, but false completion possible. |
| A7 back arrow | PASS (global app bar) | No screen-local back arrow. |
| B1–B7 field persistence | PARTIAL | Save Draft payload covers all seven; AI Expand destroys five. |
| C1 save + return persistence | UNVERIFIED | API merge exists; physical retest needed. |
| C2 back with unsaved changes | PASS (source) | Dialog appears. |
| C3 discard closes screen | **FAIL (source)** | Reloads instead of navigating. |
| C4 AI Expand generates/clear error | **FAIL / UNSAFE** | Empty prompt + destructive replace. |
| C5 AI Expand then Save | **FAIL / UNSAFE** | AI output already replaced Bible. |
| C6 prompt selector persists | PARTIAL | Associate + activate; partial failure possible. |
| D1 loading spinner | FAIL (source) | `isLoading` not rendered. |
| D2 error + retry | PARTIAL | Error card, no explicit retry. |
| D3 save fail preserves text | PASS (source) | Local state remains on error. |

### L3. Test coverage

**Existing tests (source-level):**

- `bibleSaveDraftSubmitsBiblePayload` — asserts all seven keys in the repository call.
- `bibleAiExpandDispatchesSaveBibleStudioCommand` — asserts intent and five payload keys only.
- `bibleScreenAssociatesAndActivatesOwnedPrompt` — asserts associate + activate calls.
- `bibleUnsavedEditsIndicatorShowsAfterEdit` — asserts chip.
- Back-press discard test was removed in `630759d`.

**Missing tests:**

- Project switch with dirty state → confirmation.
- Discard actually pops navigation.
- AI Expand preview/merge preserves all seven keys.
- WF-00 async ack does not mark command SUCCEEDED.
- WF-01 final callback transitions status.
- Prompt list clears on project switch/error and does not show stale prompts.
- Friendly DNS/offline error mapping.
- Approval → canon fact creation.
- Series settings edit/save and Bible compact context.

**Test status:** Not executed locally (AGENTS.md prohibits local Gradle/JVM builds). Last CI run was not re-verified in this task.

---

## M. Implementation Plan (Approval-Gated, No Changes Yet)

### Phase 0 — Verification and safety net (requires owner approval)

1. Read-only live Supabase schema/RLS diff against migrations.
2. Backup `projects.story_bible`, `approval_decisions`, `canon_facts`, `bible_versions`.
3. Export current WF-01/WF-00/WF-09 JSON and record n8n workflow IDs/versions.
4. Run one controlled AI Expand on a disposable test project and capture:
   - command status timeline,
   - WF-00 response body,
   - WF-01 execution input/output,
   - `story_bible` before/after.
5. Physical-device pass of F2-BIBLE A1–D3, recording exact failures.

**Exit criteria:** signed-off baseline, no surprises, rollback path proven.

### Phase 1 — Stop the P0 data loss (backend + WF-01)

1. Make AI Expand a preview operation (no write).
2. Send a real `user_prompt` composed from all seven fields, or a structured `bible_draft`.
3. Expand WF-01’s LLM schema to the seven-key contract, or return a patch and merge server-side.
4. Replace direct `story_bible` overwrite with merge/patch semantics.
5. Keep command `DISPATCHED` until final `BIBLE_SAVED`/`BIBLE_CHAT_COMPLETED`; map those statuses in supervisor.
6. Add a command timeline and a visible “preview ready” state in Android.

**Acceptance:** AI Expand cannot blank existing fields; command never shows success before final callback; apply requires explicit user action; existing seven fields round-trip.

### Phase 2 — Android correctness and UX

1. Pass `onBack`/`onDiscard` from nav graph; discard clears dirty and pops.
2. Add dirty guard to project switch (Save / Discard / Cancel).
3. Clear prompt list on project switch and on error; show loading/error states.
4. Add friendly network error mapping (`UnknownHostException`, `ConnectException`, `SocketTimeoutException`).
5. Render a loading spinner; add retry to the error card.
6. Add compact series-context strip (read-only) on Bible.

**Acceptance:** no unsaved-work loss; back/discard closes screen; no stale prompts; friendly errors; loading visible.

### Phase 3 — Project Settings as single source of truth

1. Add editable series-scale inputs: target episodes, episode duration, script word count.
2. Add total seasons and episodes per season (existing `PATCH /projects/:id` + `story_bible` keys; no new table).
3. Make Bible “Tone & Genre” read-only/derived, with “Edit in Project Settings”.
4. Ensure Project Settings saves genre/medium to project columns and Bible JSON consistently.
5. Show validation ranges and unsaved-change protection in the settings dialog.

**Acceptance:** all series values editable in one place; Bible displays them; no divergent genre source.

### Phase 4 — Prompt Library

1. Add optional `category`/`genre` arguments to the existing `prompt_studio` route.
2. Add a genre chip in Bible that opens Prompt Studio with BIBLE + genre.
3. Add project/global scope badges; clear stale lists.
4. Make associate+activate atomic or compensate on failure.
5. Validate prompt ownership/category when setting `active_system_prompt_id`.

**Acceptance:** SB-014 resolved; prompt scope explicit; no partial activation; deep link works.

### Phase 5 — Living Canon

1. On approval, dispatch WF-09 `UPDATE_CANON` with normalized facts/events (or a resolvable `proposal_id`).
2. Make it idempotent by approval/request ID.
3. Write `canon_facts`, `bible_versions`, and audit in one logical flow.
4. Fix Canon Viewer “Commit Fact”/“Approve” payloads.
5. Add episode-approval → canon integration test.

**Acceptance:** approved episode produces expected canon facts; Bible/continuity reads reflect them; no duplicate facts on retry.

### Phase 6 — Tests and rollout

1. Unit: repository error mapping, command status transitions, merge semantics.
2. Compose: dirty guard, discard pop, project switch, prompt scope, series context.
3. Backend: idempotency, associate+activate, approval→canon.
4. Workflow contract: WF-00 async ack, WF-01 preview/merge, final callback.
5. E2E: save draft → AI preview → apply → approve → canon.
6. Staged rollout: test project → staging → production; monitor command status and `story_bible` diffs.

**Approval gates:** Phase 0 live access; Phase 1 workflow/backend deploy; Phase 3 migration decision (only if columns needed); Phase 5 production canon writes.

---

## Appendix — Key Evidence Index

| Area | File | Lines / Nodes |
|---|---|---|
| Story Bible UI | `ai-anime-android/.../ui/project/BibleScreen.kt` | 40–215, 295–445 |
| Project Settings | `ai-anime-android/.../ui/project/ProjectDetailScreen.kt` | 93–95, 173–180, 281–330, 398–400 |
| Repository | `ai-anime-android/.../core/network/AnimeRepository.kt` | 230–248, 743–767, 836–852 |
| Navigation | `ai-anime-android/.../ui/navigation/AppNavGraph.kt` | 519, 573 |
| Bible tests | `ai-anime-android/.../androidTest/.../Batch2ControlBehaviorTest.kt` | 245–295 |
| Command mapping | `ai-backend/src/modules/anime/commands/commands.types.ts` | 2–22 |
| Command enrichment | `ai-backend/src/modules/anime/commands/commands.service.ts` | 318–334, 356–390 |
| Bible API | `ai-backend/src/modules/anime/reads/lore.routes.ts` | 475–511 |
| Project API | `ai-backend/src/modules/anime/reads/lore.routes.ts` | 358–440 |
| Bible read | `ai-backend/src/modules/anime/reads/creative.service.ts` | 3–4 |
| Prompt API | `ai-backend/src/modules/anime/infrastructure/infrastructure.routes.ts` | 710–745, 883–908 |
| Approvals | `ai-backend/src/modules/anime/approvals/approvals.service.ts` | 18–25 |
| Outbox | `ai-backend/src/modules/anime/outbox/outbox.dispatcher.ts` | 40–43 |
| Supervisor | `ai-backend/src/modules/anime/supervisor/supervisor.service.ts` | 8–11 |
| WF-00 | `ai-backend/n8n-workflows/StoryWF-00_Main_Router.json` | dispatch node 658, response 823, callback 916 |
| WF-01 | `ai-backend/n8n-workflows/StoryWF-01.json` | normalize 496, schema 535/600, write 703, callback 1275 |
| WF-09 | `ai-backend/n8n-workflows/storywf09.json` | normalizer 32, route 266, canon upsert 321 |
| Schema | `ai-backend/supabase/migrations/001_full_schema.sql` | 4657–4679, 4832–4841, 4887–4907, 5616–5638 |
| Schema alignment | `ai-backend/supabase/migrations/002_batch1_schema_alignment.sql` | 16–17 |
| Prompt library | `ai-backend/supabase/migrations/003_batch2_prompt_library.sql` | 46–85 |

---

**Status:** Audit complete at source level. No implementation performed. Awaiting explicit owner approval before any code, schema, workflow, or production change.
