# AI Cinematic Anime Engine — Ledger-First Master Remediation Prompt (v2.1)

Status: merged with review additions (2026-11-23). Execution owner: OpenCode Build mode.
Baseline heads after fetch: backend `1104d74`, Android `527056e`, CPU `4e89548` (origin/main).

## Merge additions (v2.1)

1. Ledger files are named explicitly; `docs/testing/BUG_LIST.md` is the canonical defect list.
2. Wave 5 may use **read-only** live DB introspection (zero writes) to find the 60s-master QC PENDING root cause.
3. Android: `./gradlew`, JVM tests and Android builds are **prohibited locally** (OOM); CI only.
4. Session-per-wave protocol: one session per wave, resume with "ledger se continue karo", checkpoint after each authoritative wave.
5. Existing contracts are referenced, not re-derived: `story_bible.episode_duration_min` canonical + `TARGET_CONFLICT`; only the 14 canonical story workflow IDs are editable, the 12 active legacy duplicates are untouched.

## Source of truth (read first, targeted only)

- `docs/architecture/06_SYSTEM_LEDGER.md`
- `docs/ops/WORK_LEDGER.md` (+ latest session file only)
- `docs/architecture/07_AGENT_LEARNINGS.md`
- `docs/memory/anime-engine/STATUS.md`
- `docs/testing/BUG_LIST.md`
- repo `AGENTS.md`

If ledger and source conflict, current source wins for implementation status; record and correct the ledger.

## Non-negotiable rules

- Preserve Kotlin/Compose, Fastify/TypeScript, Supabase, n8n, GPU/CPU workers, FFmpeg. No new architecture.
- Exactly 14 canonical workflows WF-00..WF-13. Primary source `n8n-workflows/`; `n8n-workflows-all/` is drift-only.
- No new workflows/tables/services/APIs/workers without proven necessity.
- Never touch AI Assistant workflows, files, containers or namespaces.
- Preserve all uncommitted user work; no reset/clean; no commit/push/deploy/live migration/production n8n changes without explicit approval.
- No secrets in logs or reports.
- Protected data: never use `naagraj ek warrior` (`db2b78b3-d391-487b-81b2-83217216754e`) or user-owned projects as destructive fixtures.

## Known blockers (verify, do not pretend)

1. No active Kaggle/GPU session; only `KGAT_` credential model works.
2. MuseTalk/LivePortrait model dataset slug reports 404.
3. No authenticated E2E project available.
4. Quick-tunnel URLs rotate.
5. No ADB/device access; Android device smoke unavailable.

Consequence: model execution, device smoke and live E2E stay UNVERIFIED/BLOCKED unless access is provided. Never fabricate runtime evidence.

## Seven waves

Run each wave as its own session: read ledger -> verify HEAD -> identify only real gaps -> plan -> implement minimal fix -> focused tests -> regression -> diff review -> ledger update -> checkpoint.

### Wave 1 — Season / Episode / Project Identity
Verify migration 007, season-aware indexes, every `on_conflict` key includes `season_no`; path Android Episode Planner -> `AnimeRepository.submitStudioCommand` -> command schema/service -> WF-00 -> WF-02 -> AI Director -> QC/WF-11 -> DB. Prove S1E1 vs S2E1 vs S3E1 (distinct titles/synopses) cannot mix; missing-season behaviour; Director and QC isolation. Fix only verified gaps; add no migration if 007 covers it.

### Wave 2 — Duration / Story Planning
Verify canonical 1–30 min contract end-to-end; `story_bible.episode_duration_min` precedence + `TARGET_CONFLICT`; separate dialogue/narration/screenplay/scene-shot budgets; act-batched WF-02; WF-03 duration gate; TTS reconciliation. Test 1/5/10/24/30 min and report dialogue budget, screenplay budget, beats, scenes, shots, planned duration, TTS duration, expected and actual master duration. No silent short episodes.

### Wave 3 — Animation / Character Consistency / Lip-Sync
Verify prewarm, fallback, `stages_applied`/`stages_skipped`, reference-image conditioning actually passed into the generation call, character identity propagation, frame count/FPS vs scene duration, no silent short-clip looping, per-scene failure isolation. MuseTalk/LivePortrait: honest status per stage.

### Wave 4 — Audio / TTS / BGM / SFX
Trace WF-03 audio plan -> worker request -> FFmpeg filters -> master. Verify per-scene BGM, all scene SFX (`amix`), dialogue/narration, TTS timing, ducking, gain, transitions, loudness, clipping, final audio duration. n8n metadata ignored by the worker must be reported as ignored, not applied.

### Wave 5 — Final Assembly / Master Output / QC (priority)
Root-cause the 60s master QC `PENDING` first: dispatch, episode identity, actual duration persistence, WF-11 input metadata, URL validation, execution failure/timeout, status transition, Android receipt. Read-only live DB introspection allowed; zero writes. Never substitute expected duration for actual; never mark QC passed without executed checks; keep failures visible/recoverable.

### Wave 6 — Android UI / CI / Integration
Targeted inspection only: duration input, season/episode selection, Episode Planner, Director, generation status, animation/audio status, QC results, final playback, error/retry. Android verification only via GitHub Actions (`conclusion=success`); no local gradlew/device claims. Push only after explicit approval, order Worker -> Android -> Backend.

### Wave 7 — Reliability / Security / Recovery
Verify outbox lease changes and migration 010 RLS grants; do not reimplement. Check idempotency, duplicate requests, retries/backoff, timeouts, stale jobs, partial rendering, worker/upload failures, auth/ownership, RLS grants, sensitive logs, status consistency. Live RLS introspection is UNVERIFIED without DB access; never weaken RLS.

## Operational constraints

- n8n v2 DataProxy: no unsafe `$node.<name>` property access; validate expressions, not just JSON parse.
- Workflow updates: `PUT` only (PATCH = 405), strip read-only fields, deactivate -> update -> activate; production requires approval.
- CPU worker URL exists in env **and** encrypted `user_infrastructure`; keep both synced, never log decrypted values.
- BYOD pooler host + TLS behaviour unchanged; no direct-host switch.
- Runtime prerequisites for live checks: backend on `ec2-user_default` with alias `backend`, matching `ANIME_WORKFLOW_SYSTEM_TOKEN`, Telegram media requires `Authorization: Bearer`.

## Ledger / handover

After every wave update `docs/ops/WORK_LEDGER.md` (Current State, Next 3, Session Index + one session file) and `docs/architecture/06_SYSTEM_LEDGER.md` (compact, <50 lines). Record wave, HEAD, verified divergence, root cause, files, tests, CI/runtime evidence, blockers, remaining work, next wave. Never rely on chat history.

## Final validation and report

Isolated synthetic data only. Verify season identity, duration contract, planning output, animation status, audio config, worker request/response, actual master duration, output metadata, QC transition, Android handling across 1/5/10/24/30 min where the environment permits. Separate source / automated test / CI / local runtime / live runtime / GPU output / audio output / master / live Supabase / live n8n evidence.

Report: (A) baseline, (B) verified existing work, (C) seven-wave results, (D) priority QC root cause, (E) CI run-level conclusions, (F) blockers, (G) git diff, (H) verdict COMPLETE / PARTIALLY COMPLETE / NOT COMPLETE. Missing GPU, E2E, ADB or live RLS access means PARTIALLY COMPLETE at best.

Final principle: verify completed work, repair only real gaps, preserve data and architecture, execute seven controlled waves, never confuse CI success with verified end-to-end output.
