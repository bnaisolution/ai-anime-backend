# Phase 5 Readiness Report

Date: 2026-11-27
Branch: `remediation/2026-11-23`
Backend head at Phase 4 proof: `8ea03b7`

## Verdict

**Conditional GO for Phase 5 onboarding. NO-GO for unrestricted production or long-form renders.**

The 60-second GPU+CPU render gate passed with a real master video, but the full WF-02 -> WF-03 single-dispatch path and the remaining infrastructure/security blockers are not closed.

## Verified Phase 4 Evidence

- Project `f4186a9a-a8a8-40f2-ba54-a0d10ecc5aaf`; episode `08234c3f-3f3b-4826-846b-912f03ebcfc0`; command `e32dc6f2-6d5f-4378-a699-63fdf29cc4a8`.
- WF-03 execution `136050` succeeded; wrapper execution `136049` succeeded; no workflow errors.
- Clips 1-3: `COMPLETED` / `MIXED`; image, audio, video, and Telegram file id present.
- CPU TTS jobs completed: `a2b84223-0df4-4208-a653-a95577d4d05a`, `20dcb424-23d1-457e-bf7f-3bb6b2661f7b`, `d414e2d2-7677-4405-9c0c-be35c8baedd7`.
- CPU FFmpeg job `ba74bfc8-0722-41dd-aff2-6c795799e6be` completed; `duration_sec=60`, `target_duration_sec=60`, `duration_delta_sec=0`, `duration_status=PASS`, `file_size_bytes=13308462`.
- Episode `output_media`: `actual_duration_sec=60`, `duration_delta_sec=0`, `duration_status=PASS`, `loudness_lufs=-14`, `subtitles_burned=true`, `final_video_url` and `master_video_url` present.
- Episode state `MIXED`; QC `PENDING`; Telegram file id present.
- Live backend image `anime-backend:phase4-test` (`sha256:a9245015463aaf4b76fa0a1bade50b58c61b35bac0c0d66eb8d05b990f7b80c6`), container `7e36f8aa94f0`, health 200.
- Live n8n WF-03 `s4RGuFSDlevgD5nC`: active, 53 nodes, 51 connections.

## Fixes Proven Live

- GPU jobs are serialized with `GPU_JOB_LOCK` and a single background executor, eliminating the earlier CUDA illegal-memory-access failure.
- GPU image generation is asynchronous and polled from WF-03.
- GPU video generation is asynchronous and polled from WF-03.
- WF-03 processes one scene per batch, which prevents the multi-item IF/Wait polling loop from dropping completed scenes.
- CPU TTS wait is 180 seconds; CPU FFmpeg remains async/pull-based.
- E2E skip-WF02 mode seeds the command record and uses three 20-second scenes, avoiding WF-02 scene overwrite and duplicate WF-03 executions.

## Blockers

### P0 - Full WF-02 -> WF-03 path is not the passing evidence

Earlier full-path runs showed WF-02 replacing the seeded scenes with a 2-scene plan, producing a 30-second master and failing the 60-second duration gate. The Phase 4 proof used `ANIME_E2E_SKIP_WF02=1` with seeded 3x20s scenes. A clean single-dispatch WF-02 run that produces a 60-second plan is still required.

### P0 - GPU quick tunnels remain

GPU workers still use `trycloudflare.com` quick tunnels. The endpoint rotates, has a short proxy timeout, and the kernel stops after roughly 20 minutes. A named/stable tunnel or backend-registered pull model is required before long renders.

### P0 - Long-form render approval

Only 60 seconds is validated. The 30-minute episode path is prohibited without explicit approval and has not been run.

### P1 - Security cleanup

- `central.pgpass` credential rotation is still pending.
- Stale quick-tunnel environment/infrastructure rows still need cleanup.

### P1 - Duplicate execution prevention

The E2E harness now skips WF-02, but the production system can still be triggered by both the wrapper and the WF-02 path. Add an idempotency/single-flight guard keyed by project/episode/command before Phase 5 load.

### P1 - Quality and publishing

- QC remains `PENDING`; approval flow was not exercised in this run.
- YouTube/Meta OAuth and publish E2E remain unverified.
- Android device smoke remains unverified.

## Recommended Phase 5 Entry Conditions

1. Run one clean WF-02 -> WF-03 60s render without seeded-scene bypass and capture duration evidence.
2. Replace the GPU quick tunnel with a stable named tunnel or pull registration.
3. Rotate `central.pgpass` and remove stale tunnel rows.
4. Add single-flight/idempotency around episode dispatch.
5. Keep 30-minute renders gated behind explicit approval.
