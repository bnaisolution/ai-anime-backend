# SYSTEM STATE LEDGER (Single Source of Truth)

## 2026-11-20 Phase 5 Live Deployment (Director Onboarding)
- Central DSN is stored in EC2 `/home/ec2-user/ai-backend/.env` as `ANIME_DATABASE_URL` and `ANIME_BACKUP_DATABASE_URL`; value is not documented here. Pooler connection verified.
- Production backup created before migration: `backups/anime-20261120T031852Z.dump` (8.4 MB, 1091 TOC entries, SHA256 `70648991df25eddf6ac7e1009ae383583e9b01558e58c69a13893e8c0e7c183b`), retention 7 days.
- Migrations `015`–`021` applied in one transaction on 2026-11-20 (`migrations-20261120T032335Z.log`). Verified tables: `director_capability_overrides`, `resource_health_checks`, `ai_model_catalog`, `director_action_audit`, `director_message_attachments`, `publish_channels`, `worker_capabilities`, `saas_plans`, `onboarding_state`; `director_conversations` has summary columns; seeds: 7 models, 3 render profiles, 4 plans.
- Deployed `anime-backend:director-onboarding-c2de9e8`; `/health` 200. Previous container retained as `anime-backend-prev-20261120T032551Z` (`anime-backend:director-gap4-20261120`) for rollback.
- Live E2E: capabilities 21; model catalog 7 / profiles 3; projectless Director chat 200; Director setup created BYOD project `45241039-42e1-40e8-944e-8b36f1a85886` with index `data_plane=byod`; project/plan readiness correctly blocked before Bible; direct production command rejected with HTTP 422 `STAGE_DEPENDENCY_BLOCKED`; SaaS plans 4, billing disabled; hardening drills 12/12.
- BYOD canonical validation: 12/14 success. WF-03 blocked by GitHub CPU FFmpeg endpoint HTTP 500 (stale `bnai-anime-cpu-20261117.loca.lt`); WF-08 blocked by YouTube OAuth token refresh because publish OAuth was intentionally skipped. Temporary n8n wrappers cleaned.
- Residual: full Bible→episode→publish E2E, actual rollback restore drill, Android device smoke, and WF-03/WF-08 external-resource validation remain open.

## 2026-11-19 AI Director First Onboarding Waves 1–4 (CODE COMPLETE)
- Backend `main` @ `19e1ee7` (Backend Tests `44573541427` green). Added server-side project setup and publish gates, fixed the setup gate to read `visual_medium`, and added unit/static coverage for production intents, missing Bible/cast, QC/episode approval, publish approval, Android command-gateway bypass, Director failure timelines, and server-gated production retry.
- Android `main` @ `b84efe0` (Build APK `44573541709` green; Android Tests `44573541720` green). Bible approval now hands off to scoped characters and first-episode preflight; manual character creation uses `createCharacterSync`; Director timeline shows failure reason and retries failed production only through the server-gated endpoint.
- EC2 checkouts synced to the latest code SHAs; live deployment remains separate.
- Phase 5 prep done: `anime-backend:director-onboarding-c2de9e8` image built on EC2 and health-smoke-tested on port 3001 (`{"status":"ok"}`), then removed. Deployment package generated with migrations 015–021 and rollback files; SHA256 verified.
- Live container image is still `anime-backend:director-gap4-20261120`; Phase 4 backend has not been deployed. Migration 018 remains a deploy prerequisite.
- Phase 4 acceptance is met for server gates, direct-command bypass, failure reporting, and retry.
- Phase 5 remains blocked on the central DB DSN and explicit migration approval.

## 2026-11-20 Gap Closure Wave 3 (DEPLOYED)
- Backend `main` @ `615a622` (Backend Tests green): publish token refresh (YouTube `refresh_token`, Instagram `fb_exchange_token`), `POST /v1/anime/publish/channels/:id/refresh`, PUBLISH_NOW refresh gate, refreshed tokens mirrored to `user_infrastructure`.
- Android `main` @ `77e3254` (Android Tests `44449929507` green: lint, JVM, Compose instrumentation, Maestro; APK build `44449929698` green). Settings ab catalog-driven hai: `/api/v1/ai/models/catalog` se providers/models, vision-capable filter, FAST/STANDARD/HIGH render profile, preferences hydrate + `/models/select` persistence. Build `v1.0.1-director.20261120`, asset `anime-debug-77e3254.apk` (22.0 MB).
- Live container `anime-backend:director-gap4-20261120`; alias `backend`, health 200. New routes 401 unauthenticated. Rollback image `anime-backend:director-gap3-20261119`.
- Flags: `DIRECTOR_CAPABILITIES_V2/DIRECTOR_READINESS=true`, `BYOD_FAIL_CLOSED=false`, `MODEL_CATALOG/PUBLISH_OAUTH_V2/SAAS_BILLING=false`.
- Migrations 015–021 NOT applied (no DB DSN on host). Code paths guarded; apply via pooler with `psql -v ON_ERROR_STOP=1 -1` before enabling model/publish flags.

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM); containers `ai-backend` and `n8n` healthy.
- ai-anime-backend: `36dc32b` (runtime code `c2de9e8`); ai-anime-android: `b84efe0`; anime-cpu-worker: `ee47fdc`.
- n8n: 14 canonical StoryWF workflows active; no workflow changed in waves 1–3.
- Anime central DB: `lqdjlcfczjottagobega.supabase.co`; Auth DB: `icypjilkcqylgbpmkyes.supabase.co`.
- Migrations 007–011 applied earlier; `015`–`021` applied 2026-11-20; BYOD runtime enabled for the dedicated test account only.

## Active State & Constraints
- Phase 3 code gap closed (Android catalog/profile UI). Phase 5 code gap closed (refresh + manual route); migration 019 is applied; real OAuth connect/publish still needs credentials.
- Phase 6 remains partial: CPU target resolver/test and S3 adapter exist, but WF-03 still ignores `storage_choice`, `render_profile` and CPU target.
- Phase 7 remains partial: BYOD validation is 12/14; WF-03 CPU/GitHub FFmpeg endpoint returns 500 and WF-08 YouTube OAuth is unavailable.
- Director setup uses `createProjectRecord` (BYOD write + central mirror/index). Legacy `createProjectSynchronous` and project listing remain central-first.
- Publish tokens refresh before PUBLISH_NOW when `PUBLISH_OAUTH_V2=true`; expired channels return `CHANNEL_EXPIRED`.
- Android cannot be built locally; verify only via GitHub Actions.
- Recreating `ai-backend` requires `--network ec2-user_default --network-alias backend`.
- Do not use live `naagraj ek warrior` (`db2b78b3-d391-487b-81b2-83217216754e`) for destructive fixtures.

## Pending / Next Steps
1. Set `MODEL_CATALOG=true`; if publishing is enabled set `PUBLISH_OAUTH_V2=true`, configure YouTube/Meta OAuth + `PUBLIC_API_BASE_URL`, then run one real connect/test/disconnect per platform.
2. Phase 7: fix the WF-03 CPU worker endpoint and run WF-08 with real YouTube OAuth; re-run 14/14 BYOD validation.
3. Finish BYOD-first list/read routing and migrate legacy central-first `createProjectSynchronous`; Director setup already writes BYOD + central mirror.
4. Run cross-tenant denial, pause/unpause, DSN rotation, DB-down fail-closed, restore and 7-day rollback drills.
5. Phase 6/7 n8n wiring: consume `storage_choice`, `render_profile` and CPU target in WF-03; prove one real S3 upload.
6. Phase 8: billing provider checkout, plan enforcement, export/delete.
7. Phase 9 GA: 7-day SLO capture, canary 10%→50%→100%, rollback drill.
