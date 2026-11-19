# SYSTEM STATE LEDGER (Single Source of Truth)

## 2026-11-19 AI Director First Onboarding Waves 1–4 (CODE COMPLETE)
- Backend `main` @ `19e1ee7` (Backend Tests `44573541427` green). Added server-side project setup and publish gates, fixed the setup gate to read `visual_medium`, and added unit/static coverage for production intents, missing Bible/cast, QC/episode approval, publish approval, Android command-gateway bypass, Director failure timelines, and server-gated production retry.
- Android `main` @ `b84efe0` (Build APK `44573541709` green; Android Tests `44573541720` green). Bible approval now hands off to scoped characters and first-episode preflight; manual character creation uses `createCharacterSync`; Director timeline shows failure reason and retries failed production only through the server-gated endpoint.
- EC2 checkouts synced to the latest code SHAs; live deployment remains separate.
- Phase 5 prep done: `anime-backend:director-onboarding-449a816` image built on EC2 and health-smoke-tested on port 3001 (`{"status":"ok"}`), then removed. Deployment package generated with migrations 015–021 and rollback files; SHA256 verified.
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
- ai-anime-backend: `19e1ee7`; ai-anime-android: `b84efe0`; anime-cpu-worker: `ee47fdc`.
- n8n: 14 canonical StoryWF workflows active; no workflow changed in waves 1–3.
- Anime central DB: `lqdjlcfczjottagobega.supabase.co`; Auth DB: `icypjilkcqylgbpmkyes.supabase.co`.
- Migrations 007–011 applied; BYOD runtime enabled for the dedicated test account only.

## Active State & Constraints
- Phase 3 code gap closed (Android catalog/profile UI). Phase 5 code gap closed (refresh + manual route); real OAuth connect/publish still needs credentials and applied migration 019.
- Phase 6 remains partial: CPU target resolver/test and S3 adapter exist, but WF-03 still ignores `storage_choice`, `render_profile` and CPU target.
- Phase 7 remains blocked: no validated BYOD n8n test plane; WF-03 Kaggle tunnel stale.
- BYOD-first project creation/list routing is still central-first (`createProjectSynchronous` writes central).
- Publish tokens refresh before PUBLISH_NOW when `PUBLISH_OAUTH_V2=true`; expired channels return `CHANNEL_EXPIRED`.
- Android cannot be built locally; verify only via GitHub Actions.
- Recreating `ai-backend` requires `--network ec2-user_default --network-alias backend`.
- Do not use live `naagraj ek warrior` (`db2b78b3-d391-487b-81b2-83217216754e`) for destructive fixtures.

## Pending / Next Steps
1. Apply migrations 015–021 through the Supabase pooler; set `MODEL_CATALOG=true`, `PUBLISH_OAUTH_V2=true`, configure YouTube/Meta OAuth + `PUBLIC_API_BASE_URL`, then run one real connect/test/disconnect per platform.
2. Phase 7: validate all 14 workflows on the BYOD test plane (gateway writes, system fan-out, `pending_actions` exclusion, callbacks).
3. Implement BYOD-first project creation/list routing (new projects still write central first).
4. Run cross-tenant denial, pause/unpause, DSN rotation, DB-down fail-closed, restore and 7-day rollback drills.
5. Phase 6/7 n8n wiring: consume `storage_choice`, `render_profile` and CPU target in WF-03; prove one real S3 upload.
6. Phase 8: billing provider checkout, plan enforcement, export/delete.
7. Phase 9 GA: 7-day SLO capture, canary 10%→50%→100%, rollback drill.
