# SYSTEM STATE LEDGER (Single Source of Truth)

## 2026-11-20 Catalog + CPU Worker Closure
- Backend `main` @ `e93a230`; runtime image `anime-backend:director-onboarding-c2de9e8` deployed; `/health` 200; rollback container `anime-backend-prev-20261120T032551Z`.
- `MODEL_CATALOG=true` enabled; live catalog returns 5 active models (7 seeded, 2 beta) + 3 render profiles via `/api/v1/ai/models/catalog`.
- WF-03 CPU endpoint refreshed: GitHub Actions worker publishes its Cloudflare quick-tunnel URL to branch `ci/worker-url`; URL mirrored into backend env and decrypted `user_infrastructure.kaggle.github_worker.worker_url`. WF-03 now succeeds (3m07s FFmpeg run).
- BYOD canonical validation: 13/14 success. Only WF-08 fails: YouTube `invalid_request: Missing required parameter: refresh_token` (OAuth not configured). Temp n8n wrappers cleaned; 14 canonical workflows active.
- Worker `main` @ `7430690` (tunnel-URL publish step); static tests green; run-worker active.

## Current Heads & Infrastructure
- EC2 t3.small; `ai-backend` + `n8n` healthy. Backend `e93a230` (runtime `c2de9e8`); Android `b84efe0`; worker `7430690`.
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
