# S1E1 Remediation + ViMax Adoption — Final 4-Phase Implementation Plan

**Version:** v3.2  
**Date:** 2026-11-28  
**Status:** APPROVED — executing all 4 phases sequentially; Phase 0 complete  
**Scope:** Phase 0 safety net applied. Phase 1 P0 implementation in progress.  
**Canonical copies:**
- Local Android repo: `docs/audit/S1E1_VIMAX_4_PHASE_IMPLEMENTATION_PLAN.md`
- EC2 backend repo: `/home/ec2-user/ai-backend/docs/plans/S1E1_VIMAX_4_PHASE_IMPLEMENTATION_PLAN.md`

> This file is the single source of truth. Do not recreate the plan from chat history. Update this file when decisions change.

---

## 0. Executive summary

S1E1 did not produce a valid 30-minute screenplay. It saved a 268-word Stage-1 fragment and an 82-scene Stage-2 plan, then WF-03 fan-out caused 6,724 calls and a 17.9-minute delay. No media was produced.

Four independent failure layers:

1. Groq Stage-1 TPM overflow forced fallback.
2. Gemini Stage-1 fallback under-generated.
3. Parser/validator accepted and persisted the fragment.
4. Stage-2 was not grounded and WF-03 fanned out per item.

The final program is **four phases**:

| Phase | Name | Purpose |
|---|---|---|
| **Phase 0** | Safety net | Freeze, preserve S1E1, flags, backups, rollback |
| **Phase 1** | P0 correctness | Stage-1/2 gates, TPM, persistence, WF-03, GPU safety, status |
| **Phase 2** | P1 ViMax capabilities | Narrative memory, shot/camera, continuity, keyframes, manifest, UI |
| **Phase 3** | P2 scale/observability | Metrics, alerts, provider registry, optional transitions, cost controls |

**Approval rule:** Owner approved all 4 phases on 2026-11-28. Execute sequentially. P1 still starts only after S1E1 replay passes P0 cleanly. P2 starts after P1 metrics are stable.

---

## 1. Verified baseline

Verified from actual repos on 2026-11-28.

### 1.1 WF-02

Files:
- `/home/ec2-user/ai-backend/n8n-workflows/storywf02.json`

Confirmed:
- Stage-2 receives `STAGE1_SUMMARY`, a 12k slice of `continuity_prompt_context`, and `STAGE1_BEATS`.
- Stage-2 does **not** receive full `full_script_text`.
- If Stage-2 returns no scenes, validator falls back to Stage-1 beats. This is a fail-open path.
- Stage-1 target derives from `episode_duration_min`, default `24`.
- JSON example hardcodes `estimated_runtime_min: 24`.
- `episodes.beat_count` exists in schema but is not written by the validator.
- `episodes.updated_at` is not written by the validator.

### 1.2 WF-03

Files:
- `/home/ec2-user/ai-backend/n8n-workflows/storywf03.json`

Confirmed:
- `Split In Batches (Max 3 Scenes)` has actual `batchSize: 1`.
- `Supabase: Fetch Clips & Checkpoints` and `Supabase: Fetch Characters & DNA` have `executeOnce` unset.
- Success/error callbacks have `executeOnce` unset.
- Success callback is terminal after `Final Production Response Formatter`.
- Error callback is wired from multiple per-item error outputs.
- `Split In Batches` done/loop outputs are wired to final assembly vs per-scene loop.

### 1.3 CPU worker

Files:
- `/home/ec2-user/ai-cpu-worker/main.py`
- `/home/ec2-user/ai-cpu-worker/worker_poll.py`

Confirmed:
- `SceneManifestItem` is scene-level: `scene_order`, `duration_sec`, `routing_type`, `camera_motion_type`, media URLs, BGM/SFX.
- No `shot_order`, `camera_idx`, first/last frame, or transition fields.
- `render-episode` sorts by `scene_order`, renders each scene, concatenates video/voice/SFX, then mixes BGM.
- `worker_poll.py` claims one CPU job at a time.

### 1.4 GPU worker

Files:
- `/home/ec2-user/ai-backend/src/modules/anime/infrastructure/infrastructure.routes.ts`

Confirmed:
- WF-03 calls GPU worker directly over HTTP:
  - `/v1/generate-image`
  - `/v1/gpu/video-assembly-line`
- GPU worker is not a `worker_jobs` poller.
- Worker already serializes jobs:
  - `GPU_JOB_LOCK` (`infrastructure.routes.ts:279`)
  - `BG_EXECUTOR = ThreadPoolExecutor(max_workers=1)` (`:297`)
  - lock inside `run_image_job` / `run_video_job` (`:366`, `:374`)

### 1.5 Android

Files:
- `app/src/main/java/org/dpdns/bnai/anime/ui/production/SceneDetailScreen.kt`
- `app/src/main/java/org/dpdns/bnai/anime/ui/review/ReviewInboxScreen.kt`
- `app/src/main/java/org/dpdns/bnai/anime/ui/qc/QCScreen.kt`

Confirmed:
- UI is scene-level.
- New shot/camera fields must be optional with fallback.

### 1.6 S1E1 evidence

- 4 beats, 82 scenes, `beat_count` persisted as 0.
- `episodes.script` = 1,471 chars / 268 words.
- `script_json.scenes` text = 1,649 words; dialogue = 474 words.
- 82 clips, no media.
- 6,724 outputs = 82 unique clips repeated 82 times.
- Groq Stage-1 `413`: requested 13,680 TPM, limit 8,000.
- Stage-2A `429` on batch item 1.
- WF-03 fetch/character/callback fan-out caused 17.9-minute delay.
- Command status `SUCCEEDED`; episode state `SCENE_PLAN_READY`; no media.

---

## 2. Four corrections locked into this plan

### 2.1 WF-03 acceptance math

Correct acceptance:
- Pre-loop `Supabase: Fetch Clips & Checkpoints` = **1 HTTP query returning 82 rows**.
- Pre-loop `Supabase: Fetch Characters & DNA` = **1 HTTP query returning 8 rows**.
- Per-scene media calls remain scene-count based.
- Terminal callback = **exactly 1 total: success XOR error**.
- Success callback on `Split In Batches` done branch.
- Error callback aggregated/deduped outside the loop.

### 2.2 Fail-closed rule

- New P0 runs: Stage-1 script missing/short → hard fail.
- Do not derive `episodes.script` from scenes in new P0 path.
- Derive-from-scenes only for legacy/backfill rows.

### 2.3 GPU concurrency

- GPU worker is direct HTTP, not `worker_jobs` polling.
- Keep `batchSize: 1`.
- Verify/retain `GPU_JOB_LOCK` + `BG_EXECUTOR(max_workers=1)`.
- Add backend per-GPU-URL semaphore only if any dispatch path bypasses worker lock.
- One in-flight GPU job per GPU URL.

### 2.4 Runtime duration

- No `24` or `30` hardcode in `storywf02.json`.
- Read `episode_duration_min` strictly from project `series_config`.
- Derive beats, words, dialogue, scene count, and tolerance dynamically.
- Missing config → `EPISODE_DURATION_MISSING`.
- Backfill existing projects before strict gate.
- 30-minute project sets `30` in project config, not workflow code.

---

## 3. Phase 0 — Safety net

**Status: COMPLETE (2026-11-28).**

Applied:
- Backed up `storywf02.json`, `storywf03.json`, and EC2 `.env` under `backups/phase0-2026-11-28/` (gitignored).
- Added default-off flags in `anime.env.ts` and EC2 `.env`.
- Marked both S1E1 commands, the episode, and the episode state `MANUAL_REVIEW`.
- Wrote 4 `S1E1_VIMAX_PHASE0` audit rows.
- Preserved 82 scenes / 82 clips as fixture; no deletes.
- Added `docs/plans/PHASE0_ROLLBACK.md`.
- Confirmed fixture rows are keyed by `project_id + season_no + episode_no`; `episode_id` is `NULL` on fixture rows.

### Actions

- Freeze S1E1 re-runs.
- Preserve S1E1 82 scenes / 82 clips as fixture; no deletion.
- Mark current S1E1 command/episode `MANUAL_REVIEW` with audit reason.
- Remove misleading `SUCCEEDED`.
- Backup `storywf02.json` and `storywf03.json`.
- Add feature flags:
  - `S1E1_STRICT_GATES`
  - `STAGE2_ACT_GROUNDING`
  - `WF03_SINGLE_FETCH`
  - `GPU_CONCURRENCY_ONE`
  - `NARRATIVE_MEMORY`
  - `SHOT_LEVEL_ASSEMBLY`
  - `KEYFRAME_CANDIDATES`
- Add migration rollback files.

### Acceptance

- S1E1 preserved.
- Flags off by default.
- Rollback path exists.
- No production behavior change.

---

## 4. Phase 1 — P0 correctness (blocking)

### 4.1 Runtime config and Stage-1

**Files:** `n8n-workflows/storywf02.json` → `Context Assembly & Prompt Constructor`, Stage 1A/1B.

**Changes:**
- Remove hardcoded `estimated_runtime_min: 24`.
- Require `series_config.episode_duration_min`.
- Derive gates dynamically:
  - 30-min example: 54–70 beats, 6600–7920 words, ~3960 dialogue, 73–90 scenes, 1800±18 sec.
  - 24-min example: ~44–60 beats, ~5280–6336 words, ~3168 dialogue, derived scene count, 1440±tolerance.
- Two-pass generation:
  1. Beat outline.
  2. Act-wise screenplay.
- Compress canon/context to stay under Groq 8k TPM.
- Add `max_tokens` and `finish_reason` check.
- Structured errors:
  - `EPISODE_DURATION_MISSING`
  - `STAGE1_TPM_EXCEEDED`
  - `STAGE1_BEAT_COUNT_LOW`
  - `STAGE1_WORD_COUNT_LOW`

**Acceptance:** No hardcoded 24/30; short output rejected; 413 avoided or fallback audited.

### 4.2 Hard quality gate

**Files:** `storywf02.json` → `Stage 1 Parser & Stage 2 Prompt Builder`, `Output Validator, Rule 37 & JSON Sanitizer`.

**Changes:**
- Remove fail-open Stage-2 fallback to Stage-1 beats.
- New P0 run: missing/short Stage-1 script → fail.
- Enforce:
  - beat range
  - screenplay word range
  - dialogue budget
  - scene range
  - runtime tolerance
  - valid `beat_order` for every scene
  - every act non-empty
  - no fabricated beat
- On failure:
  - no `SCENE_PLAN_READY`
  - no success callback
  - structured error callback
  - no ready upsert

**Acceptance:** Invalid output never persists as ready.

### 4.3 Stage-2 grounding

**Files:** `storywf02.json` → Stage 2 prompt builder, Stage 2A/2B, validator.

**Changes:**
- Pass full Stage-1 screenplay, not summary only.
- Send act-wise:
  - full act text
  - act beats
  - required scene count
  - relevant canon slice
- Empty act → fail.
- Validate every scene maps to a real beat.
- Stage2A batch size 1–2; bounded concurrency.

**Acceptance:** S1E1 replay cannot produce empty Act 1 + fabricated 82 scenes.

### 4.4 Persistence integrity

**Files:** `src/modules/anime/tenant/tenantSchema.ts`, `supabase/migrations/023_s1e1_integrity.sql`.

**Changes:**
- Persist `beat_count`.
- Add `episodes.updated_at` if missing.
- New P0 path: no derive-from-scenes fallback.
- Legacy/backfill only: derive script from scenes where needed.
- Add unique constraints:
  - scenes: `(project_id, season_no, episode_no, scene_order)`
  - clips: idempotency key based on actual columns
- Backfill/dedupe before constraints.
- Keep quality thresholds in app, not DB.

**Acceptance:** Re-run cannot duplicate scenes/clips; counts/timestamps correct; new short output fails.

### 4.5 WF-03 fan-out and callbacks

**Files:** `n8n-workflows/storywf03.json`.

**Exact changes:**
- Pre-loop:
  - `Supabase: Fetch Clips & Checkpoints` → `executeOnce: true`, use `.first()` not `.item`
  - `Supabase: Fetch Characters & DNA` → `executeOnce: true`, use `.first()`
- Aggregate fetched rows before `Split In Batches`.
- `Split In Batches (Max 3 Scenes)`:
  - keep `batchSize: 1`
  - rename node to remove misleading “Max 3”
- Success callback:
  - keep on done branch after final assembly
  - exactly 1 success
- Error callback:
  - aggregate/dedupe per-item errors
  - exactly 1 terminal error
  - never both success and error
- Add callback count guard: >1 terminal callback → fail.
- Do not put `executeOnce` on per-scene image/TTS/animation nodes.

**Acceptance:**
- 1 clip query returning 82 rows.
- 1 character query returning 8 rows.
- 82 per-scene media calls as needed.
- 1 terminal callback total: success XOR error.
- No 6,724 calls.

### 4.6 GPU safety

**Files:** `n8n-workflows/storywf03.json`, `src/modules/anime/infrastructure/infrastructure.routes.ts`, GPU dispatcher.

**Changes:**
- Keep `batchSize: 1`.
- Verify/retain `GPU_JOB_LOCK` and `BG_EXECUTOR(max_workers=1)`.
- Add per-GPU-URL semaphore in backend only if direct dispatch bypasses worker lock.
- No `worker_jobs` polling assumption for GPU.
- Multiple GPU workers allowed; one in-flight job per GPU URL.

**Acceptance:** Two concurrent episodes to same GPU URL serialize; no CUDA OOM; `active_jobs` max 1 per worker.

### 4.7 Callback and command status

**Files:** `src/modules/anime/supervisor/supervisor.service.ts`, `src/modules/anime/callbacks/callbacks.handler.ts`.

**Changes:**
- Callback includes `stage` and `completion_scope`.
- Production intents:
  - `SCENE_PLAN_READY` ≠ `SUCCEEDED`
  - `SUCCEEDED` only with final media
- Plan-only intents complete with explicit scope.
- Audit stage transitions.

**Acceptance:** S1E1 cannot show `SUCCEEDED` without media.

### 4.8 Provider/TPM

**Files:** `src/modules/anime/internal/workflowGateway.routes.ts`, `workflowGateway.llm.ts`.

**Changes:**
- Replace unbounded LLM batch `Promise.all` with bounded semaphore/queue.
- Add token-budget preflight and structured 413/429 handling.
- Keep existing `universalFallback`.
- Add provider capability metadata.

**Acceptance:** Batch concurrency bounded; no silent degradation.

### 4.9 P0 acceptance matrix

| Area | Pass condition |
|---|---|
| Runtime | Reads `episode_duration_min`; no 24/30 hardcode |
| Stage-1 | 4-beat/268-word fixture rejected |
| Stage-2 | Empty act fails; every scene grounded |
| Persistence | `beat_count`, `updated_at`, unique keys correct |
| WF-03 | 1 clip query, 1 character query, 1 terminal callback |
| GPU | 1 job per GPU URL; concurrent test serializes |
| Status | No `SUCCEEDED` without media |
| Data | S1E1 preserved; no duplicate rows |

---

## 5. Phase 2 — P1 ViMax-inspired capabilities

**Gate:** Start only after S1E1 replay passes P0 cleanly.

### 5.1 Narrative memory + context compaction

Pattern from ViMax Novel2Video; do not copy its buggy pipeline.

**Changes:**
- Prior episode summaries.
- Relevant canon retrieval.
- Character state tracking.
- Embeddings + reranker.
- Narrative compression.
- Token budget per stage.
- Cached context reuse.
- Integrate into StoryWF-02; no new workflow.

**Acceptance:** Multi-episode prompt stays under budget; continuity facts are retrieved, not blindly truncated.

### 5.2 Shot/camera metadata + CPU-worker assembly

**Files:** `ai-cpu-worker/main.py`, `tenantSchema.ts`, `024_visual_continuity.sql`, `storywf03.json`.

**Changes:**
- Extend `SceneManifestItem`:
  - `shot_order`
  - `parent_scene_order`
  - `camera_idx`
  - `transition_in`
  - `transition_out`
  - `first_frame_url`
  - `last_frame_url`
- `render-episode`:
  - group by scene
  - sort shots within scene
  - shot-level audio/subtitle sync
  - scene-level BGM
  - transition concat
- Add nullable `shot_manifest` / `camera_json` to scenes.
- If shot manifest absent, fall back to scene-level assembly.

**Acceptance:** Shot-level episode renders correctly; old scene-level episodes still render.

### 5.3 Cross-camera scene-state continuity

**Changes:**
- Add `scene_state_json`:
  - location
  - time of day
  - wardrobe
  - injuries
  - props
  - lighting
  - character positions
  - emotional state
- Each shot/camera switch inherits previous state.
- Validator flags unexplained state changes.
- Do not rely on `camera_idx` grouping alone.

**Acceptance:** Camera 1 → Camera 2 → Camera 1 carries state correctly.

### 5.4 Keyframe candidates

**Changes:**
- Default `candidate_count=1`.
- Flag enables `2` candidates + VLM best selection.
- Reuse existing image endpoint.
- GPU cost estimate required before enabling 2.

**Acceptance:** Default cost unchanged; flag-gated quality improvement.

### 5.5 Multi-view character references

**Changes:**
- Front/side/back references.
- Select by scene angle.
- Prefer valid existing reference.
- Use existing `character_reference_history`.

**Acceptance:** Character consistency improves without breaking existing references.

### 5.6 Artifact manifest / checkpoint

**Changes:**
- DB-backed manifest: type, status, path, hash, size, version.
- Resume from manifest, not file existence only.
- Integrate with clips/output_media.

**Acceptance:** Interrupted render resumes correctly; no duplicate artifacts.

### 5.7 Readiness UI + basic final QC

**Files:** `ReviewInboxScreen.kt`, `QCScreen.kt`, `SceneDetailScreen.kt`, `Storywf11`.

**Changes:**
- Show stage-level status.
- Show quality-gate failure reason and required action.
- Use existing approvals; no new approval API.
- Optional shot/camera fields render with fallback.
- Basic final QC:
  - duration
  - audio presence
  - black/frozen frame check
  - subtitle sync if applicable

**Acceptance:** User can see why S1E1 failed and what to do; final master QC is meaningful.

---

## 6. Phase 3 — P2 scale/observability

**Gate:** Start after P1 metrics are stable.

### 6.1 Stage-level metrics

- Stage-1 fallback rate.
- TPM/429/413 counts.
- Quality-gate rejection count.
- WF-03 callback count vs scene count.
- GPU OOM/queue depth.
- Media success rate.

### 6.2 Alerts

- Short Stage-1 output.
- Empty Stage-2 act.
- WF-03 fan-out above threshold.
- `SUCCEEDED` without media.
- GPU queue above threshold.
- Repeated callback duplicates.

### 6.3 Provider capability registry

- Stage → preferred provider/model mapping.
- Keep existing `universalFallback`.
- Add capability metadata; no cross-provider fallback removal.

### 6.4 Optional ViMax-style transitions

- First/last frame transitions.
- Only with GPU budget approval.
- Flag-gated; default off.

### 6.5 Advanced final QC

- Stronger visual checks.
- Audio loudness/clipping.
- Subtitle timing.
- Scene-level continuity checks.

### 6.6 P2 acceptance

- Dashboards show all P0/P1 health metrics.
- Alerts fire on known S1E1 failure modes.
- No mandatory GPU cost increase by default.
- Provider routing is auditable.

---

## 7. Backward compatibility and data migration

- New fields nullable/default:
  - `camera_json`
  - `shot_manifest`
  - `scene_state_json`
- Old episodes:
  - Android scene-level fallback.
  - WF-03 scene-level assembly.
- Additive migration only; no destructive cleanup.
- S1E1 data preserved as fixture.
- Migration order:
  1. Add nullable columns.
  2. Backfill where safe.
  3. Deduplicate existing rows.
  4. Add unique constraints.
- Rollback migration for every schema change.

---

## 8. Test plan

### 8.1 Unit

- 24-min and 30-min configs derive different gates.
- 4-beat fixture rejected.
- Missing `episode_duration_min` fails.
- Empty act rejected.
- Fabricated beat rejected.
- `beat_count` persisted.

### 8.2 Contract

- n8n JSON schema/lint.
- `executeOnce` only on approved pre-loop nodes.
- Callback shape includes stage/scope.

### 8.3 Integration

- S1E1 replay → valid beats/words/scenes/runtime.
- No fail-open fallback.
- Stage-2 every scene grounded.

### 8.4 WF-03

- 1 clip query returning 82 rows.
- 1 character query returning 8 rows.
- 1 terminal callback.
- No 6,724 calls.
- No duplicate DB rows.

### 8.5 GPU safety

- Two concurrent requests to same GPU URL serialize.
- `active_jobs` max 1 per worker.
- No CUDA OOM.

### 8.6 Backward compatibility

- Old episode without shot/camera fields renders.
- WF-03 scene-level fallback works.

### 8.7 E2E

- One staging episode.
- Correct command status.
- No false `SUCCEEDED`.

### 8.8 Regression

- Exactly 14 StoryWF workflows.
- AI Assistant workflows untouched.

---

## 9. Rollout and rollback

1. Additive migration + flags off.
2. Backend changes.
3. Import updated workflows; verify IDs unchanged.
4. Enable P0 flags on staging.
5. Replay S1E1.
6. Enable GPU guard.
7. Canary one project.
8. P1 only after clean P0 replay.
9. P2 only after P1 metrics stable.

**Rollback:** flags off → restore workflow JSON → migration rollback. No data deletion.

---

## 10. Exact file change map

| File | Phase | Change |
|---|---|---|
| `n8n-workflows/storywf02.json` | P0 | Runtime config, Stage-1 prompts, hard gates, Stage-2 grounding |
| `n8n-workflows/storywf03.json` | P0 | Pre-loop fetch, executeOnce, aggregate, single terminal callback |
| `src/modules/anime/internal/workflowGateway.routes.ts` | P0 | Bounded LLM concurrency, 413/429 handling |
| `src/modules/anime/internal/workflowGateway.llm.ts` | P0 | Provider capability/token policy |
| `src/modules/anime/supervisor/supervisor.service.ts` | P0 | Stage-aware command status |
| `src/modules/anime/callbacks/callbacks.handler.ts` | P0 | Stage/scope callback contract |
| `src/modules/anime/tenant/tenantSchema.ts` | P0 | `beat_count`, `updated_at`, unique keys |
| `supabase/migrations/023_s1e1_integrity.sql` | P0 | Integrity migration |
| `src/modules/anime/infrastructure/infrastructure.routes.ts` | P0 | Verify/retain GPU lock; per-URL semaphore if needed |
| `ai-cpu-worker/main.py` | P1 | Shot manifest + shot-aware assembly |
| `ai-cpu-worker/worker_poll.py` | P1 | Verify one-job CPU behavior remains |
| `supabase/migrations/024_visual_continuity.sql` | P1 | Camera/shot/state/artifact fields |
| `ReviewInboxScreen.kt`, `QCScreen.kt`, `SceneDetailScreen.kt` | P1 | Readiness/status/fallback UI |
| `Storywf11` | P1/P2 | Basic then advanced final QC |

---

## 11. Confirmed defaults

- `candidate_count = 1`; `2` behind flag.
- Shot-level after P0 + narrative memory.
- 1 GPU job per GPU worker/URL.
- Novel2Video as memory/retrieval capability, not a new workflow.
- Runtime duration only from project config.
- No new workflow; exactly 14 StoryWF.
- No backend Python migration; CPU worker remains Python.
- No mandatory paid API/GPU increase.
- ViMax patterns only; no wholesale code copy.

---

## 12. Non-goals

- No new n8n workflow.
- No backend Python migration.
- No ViMax wholesale code copy.
- No unbounded `asyncio.gather`.
- No 2–3 parallel GPU jobs on one Kaggle GPU.
- No destructive S1E1 deletion.
- No mandatory paid API/GPU increase.

---

## 13. Next step

**Approved scope:** all 4 phases, executed sequentially with the four corrections in Section 2.

Phase 0 is complete. Current work: Phase 1 P0 implementation.
- `storywf02.json`: runtime contract, strict gates, Stage-2 grounding, persistence
- `storywf03.json`: single pre-loop fetch, single terminal callback
- backend: command status, migration, tests
- GPU: verify existing serialization remains intact

---

## 14. Revision history

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-27 | Initial ViMax audit + S1E1 findings |
| v2 | 2026-11-28 | Added Phase 0 safety, flags, rollback, backward compatibility, GPU OOM |
| v3 | 2026-11-28 | Added 4 corrections; accidentally omitted explicit P2 |
| v3.1 | 2026-11-28 | Restored Phase 3 P2; final 4-phase plan |
| v3.2 | 2026-11-28 | Owner approved all 4 phases; Phase 0 completed and recorded |
