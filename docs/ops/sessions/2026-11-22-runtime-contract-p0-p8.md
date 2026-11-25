# 2026-11-22 — Runtime contract P0–P8 implementation

## Goal
Make episode duration (1–30 min) canonical and derive script, beat, scene, shot and dialogue budgets from it. Implement the approved P0–P8 fixes across backend, Android, n8n, CPU/GPU, tests and docs.

## Completed
- P0: backed up live n8n SQLite and exported all 14 live Story workflows; added `n8n-workflows-all/live-snapshots/live-storywf-20261122T220418Z/`.
- P1 backend: added `runtime/runtimeContract.ts`; project setup, lore create/update, commands and overview now persist/return `runtime_contract`, `target_duration_sec` and derived `script_word_count`; user word counts are ignored.
- P1 Android: added `core/runtime/RuntimeContract.kt`; Project Detail, Bible, AI Brain and Preflight use 1–30 minutes and show derived runtime; removed Android `script_word_count` editing/sending.
- P2: live WF-02 now uses contract beat/word/act ranges, batches Stage 2 by act for long episodes, and no longer hardcodes 30–50 beats or a fixed 15s dialogue budget.
- P2: live WF-03 normalizes `target_duration_sec`/`runtime_contract`, passes them to CPU assembly, and rejects a final render outside the duration tolerance.
- P3/P4: GPU image generation now downloads the identity reference and applies SDXL IP-Adapter; AnimateDiff applies keyframe IP-Adapter when supported. Added env-driven MuseTalk/LivePortrait command hooks with explicit `lipsync_status`/`lipsync_error`.
- P5 CPU: voice is fitted into the scene instead of stretching the scene; BGM is per-scene; BGM/SFX levels, sidechain and final `amix` use no normalization.
- P6: CPU returns `target_duration_sec`, `duration_delta_sec` and `duration_status`; WF-03 enforces the gate.
- P8: added backend static/route tests, CPU unit tests and Android runtime unit test.

## Verified
- Backend `npm run build` passes.
- Backend tests: 210 unit, 110 routes, 157 static, 22 regression; all pass.
- CPU: `python3 -m py_compile main.py`; pytest 24 pass.
- Live n8n: `storywf02` 29 nodes version 27; `storywf03` 41 nodes version 32; n8n healthy.
- Live backend deployed code-only to `/app/dist`; public `/v1/anime/health` returns `{"ok":true,"db":"up"}`.
- Backend dist backups before deploys: `/home/ec2-user/backups/backend-dist-20261122T225604Z.tgz`, `...T230014Z.tgz`, and `...20261123T023801Z.tgz`.
- n8n SQLite backups before edits: `/home/ec2-user/n8n-backups/database-20261122T223257Z.sqlite`, `...T223703Z.sqlite`, `...T224048Z.sqlite`, `...T225414Z.sqlite`.

## Unverified / blocked
- Android compile/tests are CI-only by Owner instruction. A local diagnostic compile found and fixed an `Int`/`Double` mismatch in `RuntimeContract.kt`; local Gradle is no longer used for Android.
- GPU P3/P4 cannot be runtime-tested: no Kaggle worker/model weights available; PuLID/MuseTalk/LivePortrait assets are not installed. IP-Adapter is best-effort and returns explicit errors on failure.
- CPU worker changes are local; no active remote CPU process was found to restart.
- WF-02 batching is static/route tested but not executed end-to-end against a real 30-minute episode.

## Files and evidence
- `ai-anime-backend/src/modules/anime/runtime/runtimeContract.ts`
- `ai-anime-backend/src/modules/anime/internal/workflowGateway.routes.ts`
- `ai-anime-backend/src/modules/anime/infrastructure/infrastructure.routes.ts`
- `ai-anime-backend/n8n-workflows/storywf02.json`
- `ai-anime-backend/n8n-workflows/storywf03.json`
- `ai-anime-backend/test/routes/workflow.gateway.routes.test.js`
- `ai-anime-backend/test/static/workflows.contract.test.js`
- `anime-cpu-worker/main.py`
- `anime-cpu-worker/tests/test_worker_units.py`
- `ai-anime-android/app/src/main/java/org/dpdns/bnai/anime/core/runtime/RuntimeContract.kt`
- `ai-anime-android/app/src/test/java/org/dpdns/bnai/anime/core/runtime/RuntimeContractTest.kt`

## Decisions
- Keep exactly 14 canonical workflows; batch inside WF-02 rather than creating workflows.
- Let the backend merge per-act LLM responses and renumber scenes; n8n consumes the existing `choices[0].message.content` shape.
- Enforce duration at WF-03 final verification with a `max(5s, 2%)` tolerance.
- Treat missing lipsync models as an explicit degradation, not a silent success.

## Next 3
1. Run Android compile/unit tests in CI and fix any Kotlin issues.
2. Execute one real 30-minute workflow run; confirm act batching, runtime gate and CPU duration status.
3. Deploy/restart the CPU worker and validate IP-Adapter/lipsync on a GPU session.

## Rollback / risk
- Restore backend dist from `/home/ec2-user/backups/backend-dist-20261122T225604Z.tgz`.
- Restore n8n SQLite from the latest backup in `/home/ec2-user/n8n-backups/`.
- Batching increases LLM latency; WF-02 Stage 2 timeout is now 600s.
- GPU IP-Adapter loads `h94/IP-Adapter` at runtime; offline workers will degrade to text-only.
