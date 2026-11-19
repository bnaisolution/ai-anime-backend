# SYSTEM STATE LEDGER (Single Source of Truth)

## 2026-11-19 Gap Closure Wave 2 (DEPLOYED)
- Backend `main` @ `406d359` (Backend Tests green): `POST /ai/director/plan`, `GET /ai/director/timeline`, publish OAuth (`019`), CPU target resolver/test (`020`), SaaS plans/subscription/usage/onboarding (`021`), Prometheus counters for all new paths.
- Android `main` @ `f31f688` (APK `v1.0.0-director.20261119`, asset `anime-debug-f31f688.apk` 21.0 MB; JVM/lint green, emulator suites pending): Director timeline + plan cards, action deep links, real publish channel OAuth UI, CPU target test, Plan & Usage tab.
- Live container `anime-backend:director-gap3-20261119`; alias `backend`, health 200. New routes return 401 unauthenticated. Rollback image: `anime-backend:director-gap2-20261118`.
- Flags: `DIRECTOR_CAPABILITIES_V2/DIRECTOR_READINESS=true`, `BYOD_FAIL_CLOSED=false`, `MODEL_CATALOG/PUBLISH_OAUTH_V2/SAAS_BILLING=false`.
- Migrations 015–021 NOT applied (no DB DSN on host). All code paths are guarded; apply through the pooler with `psql -v ON_ERROR_STOP=1 -1` before enabling publish/model flags.

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM); containers `ai-backend` and `n8n` healthy.
- ai-anime-backend: code `406d359`; ai-anime-android: code `f31f688`; anime-cpu-worker: `ee47fdc`.
- n8n: 14 canonical StoryWF workflows active; no workflow changed in wave 1/2.
- Anime central DB: `lqdjlcfczjottagobega.supabase.co`; Auth DB: `icypjilkcqylgbpmkyes.supabase.co`.
- Migrations 007/008/009/010/011 applied; BYOD runtime enabled for the dedicated test account only.

## Active State & Constraints
- BYOD lives for the test account only. Broad rollout still needs all 14 workflows validated, cross-tenant denial, pause/rotation/restore drills, and BYOD-first project creation.
- True S3 adapter exists in `storage.adapters.ts` (SigV4 PUT), but generation media still relies on Telegram handoff until WF-03 consumes `storage_choice`.
- GitHub token is used by `cpuDispatch.service.ts` for manual dispatch/test; n8n continues to use its existing worker path.
- Android cannot be built locally (no Gradle/adb on EC2); verify only via GitHub Actions.
- Recreating `ai-backend` requires `--network ec2-user_default --network-alias backend`.
- Do not use live `naagraj ek warrior` (`db2b78b3-d391-487b-81b2-83217216754e`) for destructive fixtures.
- Rotate exposed production/BYOD DB passwords, then add the pooler DSN to `.env` to unblock migrations.

## Pending / Next Steps
1. Apply migrations 015–021 through the Supabase pooler; then set `PUBLISH_OAUTH_V2=true` and configure YouTube/Meta OAuth credentials + `PUBLIC_API_BASE_URL`.
2. Validate all 14 workflows on the BYOD test plane (gateway writes, system fan-out, pending_actions exclusion, callbacks).
3. Implement BYOD-first project creation/list routing (new projects still write central first).
4. Run live cross-tenant denial, pause/unpause, DSN rotation, DB-down fail-closed, restore and 7-day rollback drills.
5. Wire `storage_choice` into WF-03 media handoff and prove one real S3 upload.
6. Phase 9 GA: 7-day SLO capture, canary 10%→50%→100%, rollback drill.
