# Execution & Verification Plan — Runtime Contract P0–P8

Date: 2026-11-23
Status: Gates 0–2 executed; Gates 3–4 blocked
Owner approval required before production deploy, CPU worker restart, GPU start and any DB migration.

## Execution Progress (2026-11-23)

- Gate 0: complete. Backend `1104d74`, Android `527056e`, CPU `4e89548` merged; backend/CPU CI and Android build/tests green.
- Gate 1: complete. Backend image `anime-backend:runtime-1104d74` built from commit and deployed; health and runtime markers verified.
- Gate 2: complete. CPU worker `main` deployed via GitHub Actions; tunnel URL synced to backend env and two encrypted `user_infrastructure` rows.
- Gate 3: blocked. No active Kaggle/GPU session; no GPU start without owner approval.
- Gate 4: blocked. Real E2E needs a GPU worker and an authenticated test project; neither was available in this execution.
- Rollback: backend image `anime-backend:rollback-20261123T032934Z`; old containers retained on EC2.

## 1. Current Baseline

| Area | Current truth |
|---|---|
| Backend live | Code-only `/app/dist` overlay is live in `ai-backend`; public health is green. Docker image is still `anime-backend:quality-fix-be46ad5`. |
| n8n live | `storywf02` v27 (29 nodes), `storywf03` v32 (41 nodes), n8n healthy. |
| CPU worker | New audio/duration code is local and uncommitted. No active CPU process. GitHub `main` still lacks the new code. |
| GPU worker | No active Kaggle session. IP-Adapter/lipsync code exists in backend, but is not runtime-validated. |
| Git | Backend, Android and CPU changes are uncommitted local working-tree changes. No commit/push/PR yet. |
| Android | Runtime-contract code exists locally; CI has not run it. Owner requires CI-only Android builds. |
| Ledger | `docs/ops/WORK_LEDGER.md` and the 2026-11-22 session file are updated locally; not pushed. |
| Backups | Backend dist, n8n SQLite and canonical workflow snapshots exist from 2026-11-22. |

## 2. Definition of Done

- [ ] Backend, Android and CPU changes committed and pushed; backend/CPU tests and Android CI green.
- [ ] Backend production runs a Docker image built from the pushed commit, not only a `docker cp` overlay.
- [ ] Live n8n still has exactly 14 canonical workflows; WF-02/WF-03 node counts and versions verified.
- [ ] CPU worker runs from pushed `main` with the new audio/duration code; tunnel URL updated in backend env.
- [ ] GPU worker has an active session with identity/lipsync assets and passes a 1-minute smoke run.
- [ ] Real 1-minute, 5-minute and 30-minute episodes complete end-to-end.
- [ ] Duration gate passes within `max(5s, target_duration_sec * 0.02)`.
- [ ] No silent degradation: missing lipsync/models return explicit status/error.
- [ ] Evidence recorded in `docs/ops/WORK_LEDGER.md` and a dated session file.

## 3. Safety Rules

1. Do not print or commit secrets, tokens, DSNs, worker URLs or env values.
2. Take a backup before replacing a container, editing n8n DB or changing production env.
3. Do not create new n8n workflows. Keep exactly 14 canonical workflows.
4. Do not run Android Gradle locally. Use GitHub Actions only.
5. Do not apply DB migrations unless explicitly approved and backed up.
6. Do not use `git add .`; stage only the intended runtime-contract files.
7. Keep old container/image until the new deploy passes health and smoke checks.

## 4. Gate 0 — Freeze, Commit, Push, CI

### 4.1 Backend

```bash
cd /data/data/com.termux/files/home/anime-audit/ai-anime-backend
git switch -c fix/runtime-contract-p0-p8
git diff --check
git status --short
# Stage only the runtime-contract implementation/test/docs files.
git add src/modules/anime/runtime/runtimeContract.ts \
  src/modules/anime/commands/commands.service.ts \
  src/modules/anime/reads/lore.routes.ts \
  src/modules/anime/reads/overview.service.ts \
  src/modules/anime/reads/project.setup.service.ts \
  src/modules/anime/internal/workflowGateway.routes.ts \
  src/modules/anime/infrastructure/infrastructure.routes.ts \
  n8n-workflows/storywf02.json \
  n8n-workflows/storywf03.json \
  test/routes/workflow.gateway.routes.test.js \
  test/static/workflows.contract.test.js \
  test/unit/project.setup.test.js
git commit -m "fix(runtime): make 1-30 minute episode contract canonical"
git push -u origin fix/runtime-contract-p0-p8
```

Local verification before push:

```bash
npm ci
npm run build
npm run test:unit
npm run test:routes
npm run test:static
npm run test:regression
```

Expected: build passes; 210 unit, 110 routes, 157 static, 22 regression.

### 4.2 Android

```bash
cd /data/data/com.termux/files/home/anime-audit/ai-anime-android
git switch -c fix/runtime-contract-p0-p8
git diff --check
git add app/src/main/java/org/dpdns/bnai/anime/core/runtime/ \
  app/src/test/java/org/dpdns/bnai/anime/core/runtime/ \
  app/src/main/java/org/dpdns/bnai/anime/core/network/AnimeApiService.kt \
  app/src/main/java/org/dpdns/bnai/anime/core/network/AnimeRepository.kt \
  app/src/main/java/org/dpdns/bnai/anime/core/network/AnimeRepositoryApi.kt \
  app/src/main/java/org/dpdns/bnai/anime/ui/brain/AIBrainScreen.kt \
  app/src/main/java/org/dpdns/bnai/anime/ui/preflight/PreflightScreen.kt \
  app/src/main/java/org/dpdns/bnai/anime/ui/project/BibleScreen.kt \
  app/src/main/java/org/dpdns/bnai/anime/ui/project/ProjectDetailScreen.kt
git commit -m "feat(runtime): use canonical 1-30 minute contract in Android"
git push -u origin fix/runtime-contract-p0-p8
```

Open PR, then verify GitHub Actions `android-build.yml` and `android-tests.yml` are green. Do not run Gradle locally.

### 4.3 CPU

```bash
cd /data/data/com.termux/files/home/anime-audit/anime-cpu-worker
git switch -c fix/runtime-contract-p0-p8
python3 -m py_compile main.py
python3 -m pytest -q
git diff --check
git add main.py tests/test_worker_units.py
git commit -m "fix(worker): fit voice and enforce target duration"
git push -u origin fix/runtime-contract-p0-p8
```

Expected: `pytest` 24 pass. Merge to `main` only after review.

### Gate 0 acceptance

- [ ] All three PRs merged or fast-forwarded to `main`.
- [ ] Backend/CPU CI green.
- [ ] Android build + tests CI green.
- [ ] Local working trees clean.
- [ ] Commit SHAs recorded.

## 5. Gate 1 — Reproducible Backend Image

Do not rely on the existing `docker cp` overlay. Build from the pushed commit.

```bash
ssh anime-ec2
cd /home/ec2-user
rm -rf ai-backend-deploy
git clone "$(git -C ai-backend remote get-url origin)" ai-backend-deploy
cd ai-backend-deploy
git checkout <BACKEND_COMMIT>
sudo docker build -t anime-backend:runtime-<SHORT_SHA> .
```

Backup current image/container:

```bash
sudo docker tag anime-backend:quality-fix-be46ad5 anime-backend:rollback-$(date -u +%Y%m%dT%H%M%SZ)
sudo docker stop ai-backend
sudo docker rename ai-backend ai-backend-old-$(date -u +%Y%m%dT%H%M%SZ)
```

Start the new container using the existing env file and network:

```bash
sudo docker run -d --name ai-backend --restart unless-stopped \
  --network ec2-user_default --network-alias backend \
  --env-file /home/ec2-user/ai-backend/.env \
  -p 127.0.0.1:3000:3000 \
  anime-backend:runtime-<SHORT_SHA>
```

Verify:

```bash
curl -fsS http://127.0.0.1:3000/v1/anime/health
sudo docker logs --tail=100 ai-backend
sudo docker exec ai-backend sh -lc \
  'grep -c "LLM batch" /app/dist/modules/anime/internal/workflowGateway.routes.js; \
   grep -c target_duration_sec /app/dist/modules/anime/runtime/runtimeContract.js; \
   grep -c run_configured_lipsync /app/dist/modules/anime/infrastructure/infrastructure.routes.js'
```

Expected: health `{"ok":true,"db":"up"}`; markers `6`, `1`, `2`; no startup errors.

### Gate 1 acceptance

- [ ] `docker inspect ai-backend` shows the new image tag.
- [ ] Container restarts cleanly.
- [ ] Health and readiness checks pass.
- [ ] Old image tag retained for rollback.
- [ ] Public health verified after reverse proxy check.

## 6. Gate 2 — CPU Worker Deploy

1. Merge CPU changes to `main`.
2. Trigger `Start Anime CPU Worker` (`run-worker.yml`) on `main`.
3. Confirm the run publishes a Cloudflare tunnel URL.
4. Update backend env values without printing them:
   - `GITHUB_WORKER_URL`
   - `TTS_WORKER_URL`
   - `FFMPEG_WORKER_URL`
5. Recreate `ai-backend` so the new env is loaded.
6. Verify worker health: unauthenticated request returns `401`; authenticated request returns `200`.
7. Run a short TTS + FFmpeg assembly job and inspect logs.

### Gate 2 acceptance

- [ ] Worker run is healthy and stays up.
- [ ] Backend points to the new tunnel URL.
- [ ] Short audio/assembly job succeeds.
- [ ] Worker log shows the new voice-fit/per-scene BGM path.
- [ ] Tunnel URL rotation is recorded as an operational risk.

## 7. Gate 3 — GPU Identity/Lipsync Smoke

Prerequisites: active GPU worker, model assets available, identity reference image available.

1. Start the GPU worker through the existing infrastructure route/Kaggle session.
2. Verify worker health and GPU/model-load logs.
3. Run one 1-minute episode with an identity reference.
4. Inspect:
   - SDXL image output and identity consistency.
   - AnimateDiff clip length/fps and loop behavior.
   - `lipsync_requested`, `lipsync_status`, `lipsync_error`.
   - `stage_errors` is empty.
5. If MuseTalk/LivePortrait assets are present, set `MUSETALK_CMD`/`LIVEPORTRAIT_CMD` and rerun.
6. If assets are absent, confirm explicit `UNAVAILABLE` status, not silent success.

### Gate 3 acceptance

- [ ] IP-Adapter loads or returns an explicit error.
- [ ] Identity reference download works.
- [ ] No `tempdir`/undefined-variable errors.
- [ ] Lipsync status is truthful.
- [ ] 1-minute output has no black frames and has audio.

## 8. Gate 4 — End-to-End Episodes

Run in this order. Do not jump to 30 minutes before the 1-minute smoke passes.

### 8.1 One-minute smoke

- Target: `60s`; dialogue: `132`; midpoint: `242`; acts: `1`.
- Verify full WF-02 → WF-03 → CPU chain.
- Verify duration gate and output file.

### 8.2 Five-minute act test

- Target: `300s`; acts: `3`.
- Verify act batching, scene renumbering and Stage 2 timeout behavior.

### 8.3 Fifteen-minute act test (optional but recommended)

- Target: `900s`; acts: `4`.
- Verify larger batch and worker stability.

### 8.4 Thirty-minute full run

- Target: `1800s`; dialogue: `3960`; midpoint: `7260`; acts: `6`.
- Verify no timeout, no stage errors, duration within tolerance.

For each run record:

```text
Episode ID:
Workflow execution ID:
Target duration:
Actual duration:
Delta:
Duration status:
Scene count / expected:
Act count / expected:
Stage errors:
Output URL:
Quality notes:
```

### Gate 4 acceptance

- [ ] 1-minute smoke passes.
- [ ] 5-minute act batching passes.
- [ ] 30-minute run completes.
- [ ] Duration is within `max(5s, 2%)`.
- [ ] Scene/act counts match the contract.
- [ ] No silent failures.

## 9. Quality Acceptance

### Hard gates

- [ ] 1280x720, 24fps final video.
- [ ] Audio present, intelligible, no clipping or dead air.
- [ ] Subtitles present and readable.
- [ ] No black frames or missing scene media.
- [ ] Duration gate passes.
- [ ] Missing models return explicit status/error.

### Quality goals

- [ ] Character identity is consistent across scenes.
- [ ] Motion is not frozen for long stretches.
- [ ] AnimateDiff loops are acceptable for the episode length.
- [ ] BGM is per-scene, not one global track.
- [ ] Voice fits the scene without unnatural stretching.
- [ ] Lipsync is present when models are configured.

Current expected quality without Gates 2–3: animated-storyboard/prototype quality, limited motion, no real lip-sync, old audio behavior.

## 10. Rollback

- Backend image: start `anime-backend:rollback-<timestamp>` or restore the latest `/home/ec2-user/backups/backend-dist-*.tgz`.
- n8n: restore the latest `/home/ec2-user/n8n-backups/database-*.sqlite` after stopping n8n.
- CPU: stop the workflow run and re-run the previous `main` commit.
- GPU: stop the Kaggle session.
- No DB migration is part of this plan, so no DB rollback is expected.

## 11. Evidence Template

```text
Date:
Backend commit / image:
Android commit / CI runs:
CPU commit / workflow run:
n8n WF-02 version/nodes:
n8n WF-03 version/nodes:
Worker URL: REDACTED
Episodes:
Duration gate results:
Quality verdict:
Rollback tag:
Ledger updated:
```

## 12. Execution Order Summary

1. Commit/push backend, Android, CPU.
2. Get backend/CPU CI and Android CI green.
3. Build and deploy backend image from commit.
4. Deploy CPU worker and update backend worker URLs.
5. Start GPU worker and run 1-minute identity/lipsync smoke.
6. Run 1/5/30-minute E2E episodes.
7. Record evidence, update ledger and session file.
8. Only then evaluate whether P3/P4 quality work is complete.
