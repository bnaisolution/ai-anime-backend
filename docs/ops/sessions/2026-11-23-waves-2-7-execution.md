# 2026-11-23/24 — Waves 2–7 Execution

Branch: `remediation/2026-11-23` in all three repos (from origin/main: backend `1104d74`, Android `527056e`, CPU `4e89548`). No commits/pushes/deploys.

## W2 Duration
- Verified canonical 1–30 min contract in `src/modules/anime/runtime/runtimeContract.ts` (clamp, tolerance, dialogue/screenplay/beat/scene/shot budgets, act count, render tier).
- Verified WF-02 act batching and WF-03 duration gate use `runtime_contract`; CPU worker shares the 2%/5s tolerance gate.
- Added `test/unit/runtime.contract.test.js` (1/5/10/24/30 min matrix) — 4 tests pass.

## W3 Animation (local GPU worker `/home/ec2-user/ai-kaggle-worker/main.py`)
- Verified defect: AnimateDiff was text-only; character keyframe never conditioned generation, and stage outcomes were unreported.
- Added `AnimateDiffVideoToVideoPipeline` path with honest fallback to text-only; response now returns `reference_conditioned`, `lipsync_status`, `expression_status`, `stages_applied`, `stages_skipped`.
- `py_compile` OK. GPU execution UNVERIFIED (no active Kaggle/GPU session). Directory is not a git repo — local-only change.

## W4 Audio (CPU worker `main.py`)
- Verified defect: `ducking_db` request field was ignored; BGM gain hardcoded at 0.38.
- BGM gain now derives from `ducking_db` (dB); added `measure_audio_stats()` using ffmpeg `volumedetect`, returned as `audio_stats` (mean/max dB, clipping flag, measured).
- `py_compile` + 32 pytest pass (`PYTHONPATH=. /tmp/opencode/venv/bin/pytest`). Live audio render UNVERIFIED.

## W5 Final Assembly / QC (priority)
- Root cause: WF-03 sets `qc_status='PENDING'` and never dispatches WF-11; supervisor also only read top-level callback media, so nested `callback.result` URLs/duration/size were dropped, and `output_media` was overwritten.
- `supervisor.service.ts`: resolves media from top level **or** `result`/`output_media` (incl. WF-03's `master_video_url` + `actual_duration_sec`), merges `output_media` instead of overwriting (preserves duration, file size, Telegram ids, loudness/ducking metadata), season-aware write, audit.
- Auto-QC: on production-command success with a real master URL, enqueue idempotent `RUN_QC` (deterministic key from project/season/episode/master-url hash) through the existing command+outbox path; RF-00 routes RUN_QC to WF-11. No new workflow/service.
- `Storywf11.json`: no longer substitutes expected duration for actual; missing actual/expected duration now fails QC; accepts WF-03 `file_size_bytes` shape.
- Human gate: `POST /episodes/:episodeNo/approval` now accepts `PENDING_HUMAN_APPROVAL`, writes `approval_status=APPROVED` **and** `qc_status=APPROVED`, and closes the matching `pending_actions` QC task. Direct client `qc_status` PATCH removed.
- Tests: supervisor media/auto-QC tests + WF-11 static assertions.

## W6 Android
- `QCScreen.kt`: season-aware episode fetch/selector (was hardcoded season 1), `SxEy` labels, RUN_QC passes `seasonNo`, approval goes through canonical `POST /episodes/:episodeNo/approval` instead of writing `qc_status` directly; PENDING_HUMAN_APPROVAL is explained and approval-gated.
- New client bindings: `AnimeApiService.decideEpisodeApproval`, `AnimeRepositoryApi.submitEpisodeApproval`, repository impl.
- Android build/CI UNVERIFIED (local gradlew prohibited; push needs approval). Backend static Android contract tests pass.

## W7 Reliability / Security
- Verified outbox lease logic in `migration 010` (`claim_outbox_batch`: stale lease recovery, attempts<5, `FOR UPDATE SKIP LOCKED`) and `outbox.repo.ts` stale recovery/backoff/dead-letter.
- Verified migration 010 revokes anon/authenticated and grants only `service_role` for claim/redaction/atomic-insert functions.
- Live RLS/policy introspection UNVERIFIED (no DSN/live SQL access).

## Test evidence
- Backend docker `anime-backend:runtime-1104d74`: unit 216/216, routes 110/110, static 163/163.
- CPU worker: 32 pytest pass.
- GPU worker: `py_compile` only.

## Blockers
- No active GPU/Kaggle session; no authenticated E2E project; no live n8n update approval; no Android CI push approval; no live DB/RLS introspection.

## Next
1. Sync WF-00/WF-11 + deploy backend on approval, then re-run one real 1-minute episode to confirm MIXED → auto RUN_QC → PENDING_HUMAN_APPROVAL → approve → publish.
2. Run the 1/5/30-minute matrix on a live GPU session and capture actual master duration/audio stats.
3. Push Android branch for CI build + emulator tests after approval.
