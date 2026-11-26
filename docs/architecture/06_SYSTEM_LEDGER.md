# SYSTEM STATE LEDGER (Single Source of Truth)

## 2026-11-20 Catalog + CPU Worker Closure
- Backend `main` @ `e93a230`; runtime image `anime-backend:director-onboarding-c2de9e8` deployed; `/health` 200; rollback container `anime-backend-prev-20261120T032551Z`.
- `MODEL_CATALOG=true` enabled; live catalog returns 5 active models (7 seeded, 2 beta) + 3 render profiles via `/api/v1/ai/models/catalog`.
- WF-03 CPU endpoint refreshed: GitHub Actions worker publishes its Cloudflare quick-tunnel URL to branch `ci/worker-url`; URL mirrored into backend env and decrypted `user_infrastructure.kaggle.github_worker.worker_url`. WF-03 now succeeds (3m07s FFmpeg run).
- BYOD canonical validation: 13/14 success. Only WF-08 fails: YouTube `invalid_request: Missing required parameter: refresh_token` (OAuth not configured). Temp n8n wrappers cleaned; 14 canonical workflows active.
- Worker `main` @ `7430690` (tunnel-URL publish step); static tests green; run-worker active.

## Current Heads & Infrastructure
- EC2 t3.small; `ai-backend` + `n8n` healthy. Compose backend image `ec2-user-backend` (`sha256:b6ab4832c03033d7f052928329106a550da3fb42799ba53a376240552636c87b`) built 2026-11-26T17:49:20Z from clean `remediation/2026-11-23` HEAD `d7046924ace9508688728da1da1b2365d248f95e`; container `af19c4d46328` started 2026-11-26T17:49:32Z, health 200. Old runtime tags `c2de9e8`/`1104d74`; rollback tag `anime-backend:rollback-pre-d704692`. Android `b84efe0`; worker `7430690`.
- Central DB `lqdjlcfczjottagobega.supabase.co`; Auth DB `icypjilkcqylgbpmkyes.supabase.co`; migrations 015–021 applied 2026-11-20.
- n8n: 14 canonical StoryWF active. Backend must join `ec2-user_default` with alias `backend`.
- BYOD runtime enabled for the dedicated test account; Director setup writes BYOD + central mirror.

## Active State & Constraints
- Phase 5 (Director onboarding) deployed; residual: full Bible→episode→publish E2E, rollback restore drill, Android device smoke.
- Phase 6/7 partial: WF-03 consumes the CPU target now; `storage_choice`/`render_profile`/S3 upload still unwired.
- WF-08 analytics needs real YouTube OAuth; quick-tunnel URL rotates every worker run (currently synced manually to env + DB).
- Legacy `createProjectSynchronous` and project listing remain central-first.
- Publish refresh only when `PUBLISH_OAUTH_V2=true`; no OAuth creds/`PUBLIC_API_BASE_URL` yet.
- Never build Android locally; verify via GitHub Actions.
- Do not use live `naagraj ek warrior` (`db2b78b3-d391-487b-81b2-83217216754e`) for destructive fixtures.

## Pending / Next Steps
1. Configure YouTube/Meta OAuth + `PUBLIC_API_BASE_URL`, set `PUBLISH_OAUTH_V2=true`, run WF-08 and one real connect/test/disconnect.
2. Automate worker URL sync (named tunnel or backend registration) so quick-tunnel rotation cannot break WF-03.
3. Finish BYOD-first list/read routing; migrate legacy central-first creation.
4. Run cross-tenant denial, pause/unpause, DSN rotation, DB-down fail-closed, restore/7-day rollback drills.
5. Wire `storage_choice`, `render_profile`, CPU target in WF-03; prove one real S3 upload.
6. Phase 8 billing/plan enforcement/export-delete; Phase 9 SLO + canary + rollback.

## 2026-11-22 REAL_HUMAN 60s Master + GPU/CPU Hardening
- REAL_HUMAN project `b479db60-75c4-4e46-b5e4-89a271740cc8` / episode `16e059e2-1c26-4e15-b044-20acfa9c97c2` now has a verified 60s master: 1280x720 h264 24fps, AAC 96kHz stereo, 13,809,345 bytes, `freezedetect` clean, mean audio -17.0 dB / max -1.3 dB.
- WF-03 execution `128919` succeeded on resume; all four clips `COMPLETED/MIXED`, episode `MIXED`, QC `PENDING`, Telegram master present.
- Root cause of the first failure was Cloudflare quick-tunnel `524` on the **first** AnimateDiff request (model load exceeded the 120s proxy window). Added AnimateDiff prewarm on GPU1; `/health` now reports `animatediff_prewarmed=true`. Subsequent first request completed inside the window.
- GPU fallback now catches animation failure, keeps the keyframe, applies Ken Burns/zoompan, and returns `animation_status` plus `stages_skipped`; worker disables further animation after a CUDA/memory failure.
- CPU worker now mixes **all** scene SFX tracks (not only the first), fills 16:9 via `scale=increase,crop` instead of letterboxing, and all four clips were re-rendered with the corrected frame.
- Backend `commands` schema now accepts arbitrary visual-medium/style strings (including `REALISTIC`/`REAL_HUMAN`), not only ANIME/REALISTIC literals.
- Tunnel hardening verified live: `tunnel_registered=true`, `tunnel_last_error=null`, 2 GPUs, SDXL + AnimateDiff prewarmed. CPU worker URL refreshed to `rely-midnight-variation-ctrl.trycloudflare.com` in encrypted infrastructure.
- Backend `npm run build` + `npm run test:safe` (209 unit + 109 route + 155 static) green.
- Git heads: backend `c755b90`; CPU worker `95094da`; audio assets `02b3a4f`. Verified master also at `/home/ec2-user/realhuman10-master.mp4`.

## 2026-11-23/24 Seven-Wave Remediation (branch remediation/2026-11-23)
- W1+W2: WF-00 season/title/synopsis + season-aware idempotency lock; WF-11 QC queries filter `season_no`; 1–30 min contract, act batching and duration gates verified with matrix tests.
- W3 (GPU): image-conditioned AnimateDiff v2v + honest `reference_conditioned`/lipsync/stage status; W4 (CPU): `ducking_db` → BGM gain, ffmpeg `audio_stats`; 32 pytest green.
- W5: QC `PENDING` root cause fixed — supervisor reads nested `callback.result` media, merges `output_media` (duration/size/telegram preserved), enqueues idempotent RUN_QC; WF-11 stops substituting expected duration; approval accepts `PENDING_HUMAN_APPROVAL`, writes `qc_status=APPROVED`, closes pending task; client `qc_status` PATCH blocked.
- W6+W7: Android QC is season-aware and approves via canonical endpoint (CI UNVERIFIED); outbox lease + migration 010 RLS grants verified in source/static, live RLS UNVERIFIED. Tests: backend unit 216, routes 110, static 163 green.
- Runtime audit 2026-11-26: live n8n WF-00/02/03/04/05/06/08–13 match repo; WF-01 (4 nodes) + WF-07 (2 nodes: season/approval publish) still drift. 60s v6 run predates deploy → MIXED/PENDING; 300s execution 133507/133508 failed at CPU FFmpeg Branch F with Cloudflare 524 from rotating quick-tunnel URL (GPU scenes completed; WF-02 scene count 0 + hand-seeded fixtures). Phase 1 complete: clean HEAD `d704692` committed/pushed and deployed; next sync WF-01/07, replace quick tunnel, rerun real E2E.
