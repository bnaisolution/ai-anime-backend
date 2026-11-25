# 2026-11-23 — Gates 0–2 execution

## Goal
Execute the approved execution plan from Gate 0 through Gate 4 where the environment allowed it.

## Completed
- Gate 0:
  - Backend branch `fix/runtime-contract-p0-p8` committed and merged to `main` as `1104d74`.
  - Android branch `fix/runtime-contract-p0-p8` committed and merged to `main` as `527056e`.
  - CPU branch `fix/runtime-contract-p0-p8` committed and merged to `main` as `4e89548`.
  - Fixed Android instrumentation expectation from `Episode Duration (minutes)` to `Episode Duration (1–30 minutes)`.
  - Aligned CPU duration tolerance with WF-03: `max(5s, target_duration_sec * 0.02)`.
- Gate 1:
  - Built `anime-backend:runtime-1104d74` from the pushed commit in a clean EC2 clone.
  - Tagged rollback image `anime-backend:rollback-20261123T032934Z`.
  - Replaced `ai-backend` with the new image; kept old containers for rollback.
  - Verified `/v1/anime/health` and runtime markers in `/app/dist`.
- Gate 2:
  - Triggered CPU worker workflow on `main` (run `45106463435`).
  - Worker published a new Cloudflare tunnel URL.
  - Updated `GITHUB_WORKER_URL`, `TTS_WORKER_URL`, `FFMPEG_WORKER_URL` in EC2 backend env.
  - Rotated the encrypted `github_worker.worker_url` for both active `user_infrastructure` rows.
  - Recreated `ai-backend` so the new env loaded.
  - Verified worker `/health` returns HTTP 200 and backend public health is green.
- n8n remained on `storywf02` v27 (29 nodes) and `storywf03` v32 (41 nodes); n8n healthy.

## Verified
- Backend local: build + 210 unit + 110 routes + 157 static + 22 regression pass.
- CPU local: `py_compile` + 32 pytest pass.
- Backend CI run `45106024940`: green.
- Android CI runs `45107179474` and `45107179489`: build, JVM, lint, Maestro and Compose instrumentation green.
- CPU worker CI run `45106024815`: green.
- Backend image `anime-backend:runtime-1104d74`; health `{"ok":true,"db":"up"}`.
- Dist markers: LLM batch `6`, runtime contract `1`, lipsync hooks `2`.
- Public health `https://api.bnai.dpdns.org/v1/anime/health` returns `{"ok":true,"db":"up"}`.
- Worker tunnel health returns HTTP 200; backend env and both encrypted infra rows match the new URL.
- No active `kaggle_sessions` rows.

## Unverified / blocked
- Gate 3 blocked: no active Kaggle/GPU worker and no GPU start without explicit owner approval.
- Gate 4 blocked: real 1/5/30-minute E2E needs GPU output and an authenticated test project; not executed.
- CPU worker live render was not exercised with real media; only health and CI contract tests passed.
- Android physical-device smoke not run; CI emulator coverage only.

## Files and evidence
- Backend: `src/modules/anime/runtime/runtimeContract.ts`, workflow gateway, infrastructure routes, WF-02/WF-03 JSON, tests.
- Android: `core/runtime/RuntimeContract.kt`, Project Detail/Bible/AI Brain/Preflight, `Batch2FullControlCoverageTest.kt`.
- CPU: `main.py`, `tests/test_worker_units.py`.
- Execution plan: `docs/ops/EXECUTION_VERIFICATION_PLAN_2026-11-23.md`.

## Decisions
- Deploy backend from a clean clone and image, not a `docker cp` overlay.
- Sync the rotating CPU tunnel URL to both backend env and encrypted infrastructure rows.
- Do not start a paid GPU session without explicit owner approval.
- Do not create production test episodes without an approved test project.

## Next 3
1. Start a GPU worker and run the 1-minute identity/lipsync smoke.
2. Run 1/5/30-minute E2E episodes and record duration/scene/act results.
3. Verify worker live audio rendering with real scene media.

## Rollback / risk
- Backend image rollback: `anime-backend:rollback-20261123T032934Z`.
- Old backend containers: `ai-backend-old-20261123T032934Z` and `ai-backend-prev-20261123T034223Z`.
- CPU worker run `45106463435` is long-running; stop it from GitHub Actions if needed.
- Quick-tunnel URL rotates again if the worker restarts.
