# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM)
- ai-anime-android: `main` @ `79ebe23` (dynamic genre/medium UI + CI test fixes) | APK CI green (`43742858229`), Android Tests green (`43742858203`)
- ai-backend: working tree after quota hardening | live container `anime-backend:010-quota-hardening`, network alias `backend`, health 200; migration 010 applied
- anime-cpu-worker: `main` @ `ee47fdc` | pushed to origin
- n8n Workflows: canonical WF-01 (`UeEXeimGGwqIh84T`), WF-02 (`qRUdhg1PNDK2wJk6`), WF-03 (`s4RGuFSDlevgD5nC`), WF-10 (`swOEbQV3iNUNmMwu`) live, active, node/connection diff 0 vs repo
- Migration 007: applied to production; backup `anime-prod-20261115T182315Z.dump` sha256 `b9949f118acff44482fd665b12fe457b03ea264d111a8b7b58c41d69af2f4050`
- Migration 008: applied to production; prompt-library medium check now allows `ANIME`, `MANHWA`, `3D`, `2D_ANIMATION`, `REAL_HUMAN`, `LIVE_ACTION`, `CINEMATIC`, `HYBRID`
- Migration 010: applied transactionally on 2026-11-16; adds `outbox_events.payload_redacted_at`, batched redaction (100 rows/call), retry cap + dead-letter reaper, claim indexes, and revokes sensitive `anon`/`authenticated` table/function access.

## Live Deployment (Uncommitted Working Tree)
- Backend working tree now has uncommitted multi-tenant GPU/BYOK fixes: nested GPU setup payload, recursive secret masking, BYOK gateway key resolution, per-user `kaggle_sessions` scoping, outbox Kaggle auto-start, and scoped Kaggle tunnel registration.
- Migration `009_kaggle_sessions_user_scope.sql` was applied transactionally on 2026-11-15 after a clean dry-run. `kaggle_sessions` now has `user_id text`, `tenant_id uuid`, and unique `(user_id, session_name)`; the old global row remains active with `user_id IS NULL` and is intentionally invisible to user-scoped code.
- Live image `anime-backend:009-quota-fix` deployed on `ec2-user_default` with `backend` alias; `/health` 200 and `/v1/anime/internal/worker/session` returns 401 without a token. A signed smoke session upserted/read/deleted successfully.
- Embedded Kaggle worker no longer receives `ANIME_SUPABASE_SERVICE_ROLE_KEY`; it registers its tunnel through `POST /v1/anime/internal/worker/session` with a 6-hour `gpu_session` HMAC token restricted to the owning user and Cloudflare/localtunnel hosts. Clip checkpoints are written by n8n as before.
- Android `SettingsScreen.kt` now saves the backend’s nested schema (`kaggle_primary`, `telegram_storage`, `github_worker`, `auto_deploy_kaggle`) and hydrates nested values with flat fallbacks; still uncommitted and not CI-verified.
- Backend verification in working tree: `npm run build`, `test:unit` 147/147, `test:routes` 100/100, `test:static` 128/128, `test:regression` 22/22.
- 2026-11-15 quota incident root cause: live `outbox_events.processing_started_at` was missing (migration 002 not fully applied). `markDispatched`/`markFailed` ignored Supabase update errors, so events stayed `processing`; the fallback stale-lease recovery reset them every tick, re-dispatching the same terminal commands and generating ~9.4k reconcile events, ~5.5k n8n WF-00 executions, 5.5 GB egress, and 3.8 GB log ingestion. DB size was only ~119 MB / 0.5 GB.
- Quota hardening applied: `claim_outbox_batch` now recovers stale leases and dead-letters `attempts >= 5`; dispatcher/supervisor poll at 10s; redaction runs every 15m in 100-row batches with `payload_redacted_at`; duplicate `test-backend` container removed.
- Gateway fixed: shared `ANIME_WORKFLOW_SYSTEM_TOKEN` set in backend `.env` and n8n compose env; SHA-256 prefixes match; system gateway smoke returned 200; n8n WF-10 and storywf13 executions succeed.
- Security hardening applied: `kaggle_sessions`/`story_state` RLS enabled; sensitive tables revoked from `anon`/`authenticated`; `claim_outbox_batch`, `redact_expired_payloads`, and other sensitive SECURITY DEFINER functions are service-role-only.

## Recent Milestones (Rolling Window - Last 3)
- [2026-11-15] Isolated fixture validation PASS on `anime-backend:0bd930e`: dynamic genre order `Action Fantasy, Action, Dark Fantasy, Thriller`, custom `MANHWA` prompt, and S1/S2 episode/plan/scene/clip reads all resolved correctly; fixture rows deleted and `~/.pgpass.anime-fixture` removed.
- [2026-11-15] Fixed creative context precedence so non-empty `projects.genre` is authoritative and `story_bible.genre` is only a fallback; committed `0bd930e`, CI `43749010661` green, deployed with `backend` alias.
- [2026-11-15] Migration 008 applied: `user_system_prompts_visual_medium_check` widened to all 8 canonical visual mediums after a `MANHWA` custom prompt insert failed the old two-value constraint.
- [2026-11-15] Migration 007 applied transactionally after `pg_dump`: all four tables now have `season_no NOT NULL DEFAULT 1`; legacy unique constraints + standalone unique indexes removed; dual-season insert smoke passed and rolled back; live Nagraj config/row counts unchanged.
- [2026-11-15] Backend `5a3545d` deployed (`Backend Tests` `43746994533` success); fixed WF-02 duplicate scene key, WF-10 season state upsert, and GPU clip checkpoint `on_conflict`; restored n8n→`backend` DNS alias; `/health` 200.
- [2026-11-15] WF-01/WF-02/WF-03/WF-10 imported via n8n `PUT`, reactivated, and verified `active=true` with zero node/connection drift. Live `naagraj ek warrior` remains untouched.
- [2026-11-13] OpenCode intelligence upgrade (non-risky): global memory files, task registry, token baseline, 9 specialized agents, AGENTS.md memory protocol, project memory scaffold. Free usage limit hit during fresh-session validation (retry ~8.7h). No risky ops performed.
- [2026-11-13] Batch C follow-up: backend CI fixed (stale tests) + pushed at `39916c8`; Backend Tests green (`43412070136`). n8n error/success callback `$node.name` bug fixed in all 14 canonical workflows + WF-01 LLM model expressions -> updated + published live via n8n API. GPU runtime (dead tunnel) still pending.
- [2026-11-13] Runtime deploy (`918ac74`, `cc9fef5`): backend gateway scopes `projects` by `id`; WF-00 passes ingest `sessionId` as `command_id`; missing gateway token configured for n8n/backend; backend rebuilt and WF-00 imported/published. WF-00 executions now succeed.
- [2026-11-13] Audit vs `MASTER_COMPLETION_BLUEPRINT_FINAL` (2026-11-10): registry IDs now fully consistent (14/14), n8n credential boundary moved to backend gateway (`ANIME_WORKFLOW_GATEWAY_TOKEN`, no service-role/provider keys in JSON), callbacks+retry+stop nodes in all 14, worker signed auth, provider/model catalog, platform pool, key registry, S3 storage, Media3 playback implemented. Backend CI fix pushed at `39916c8`; WF-03 runtime error; release signing, DB restricted role/RLS, BYOI split, real replication, backup schedule still open.

## Active State & Next Immediate Action
- 2026-11-15 working tree audit: live tenant tables verified through the backend service role (`anime_tenants` 2, `anime_tenant_members` 2, `quota_usage` 7, `user_infrastructure` 1). The live user has no saved Kaggle/GPU credentials, so the stale global `kaggle_sessions` row cannot be replaced until the user saves them.
- Live smoke: per-user session route works end-to-end; smoke row deleted, only the old `<null>|kaggle_story_engine|active` row remains.
- TRUE BYOD DATABASE IS STILL MISSING: all anime data uses the global `animeSupabase` client; `providerRegistry.database_secondary` and `replication.service.ts` are interface/mock only.
- TRUE S3/CUSTOM STORAGE IS PARTIAL: adapters and routes exist, but the generation pipeline still relies on Telegram/custom URLs; S3 is not wired into WF-03 media persistence.
- GITHUB WORKER TOKEN IS STORED BUT NOT USED by the worker/workflows yet.
- Migrations 007/008/009/010, backend `anime-backend:010-quota-hardening` (uncommitted working tree), and workflow deployment are live. `npm run test:static` = 128/128; packaged creative registry smoke = 14 genres, 8 mediums, `Action / Fantasy` → `Action Fantasy`, `MANHWA` resolved.
- Fixture validation is complete and cleaned up: 0 fixture projects/prompts remain; live Nagraj episodes/states/scenes/clips remain 0 and its config is unchanged.
- Any future `ai-backend` recreation MUST include `--network ec2-user_default --network-alias backend`; workflows fall back to `http://backend:3000` and n8n has no URL override.
- Production DB password was shared in chat and used for migrations. Rotate it after validation, then update EC2 backend env; both temporary pgpass files were removed.
- Live `naagraj ek warrior` (`db2b78b3-d391-487b-81b2-83217216754e`) config/row counts unchanged; do not use it for destructive test fixtures.
- WF-03 is still blocked: `kaggle_sessions.kaggle_story_engine` points at `https://travelers-individual-parameter-entertainment.trycloudflare.com` from 2026-09-30, and every `/health`, `/v1/health`, `/docs`, `/` probe fails. No Kaggle credentials are stored in the live user's infrastructure, so the tunnel cannot be restarted from EC2.
- Android runtime verification is blocked locally: no `adb` or emulator is installed/connected. APK artifact remains `anime-debug-apk` from `Build Anime APK` run `43742858229` (`79ebe23`).
- PAT rotation, port restriction, restricted DB role/RLS, WF-03 GPU runtime, release signing remain open.
- NEXT: rotate the exposed DB password, then provide a device/emulator for APK verification and restart the Kaggle GPU worker (or supply Kaggle credentials) to refresh the WF-03 tunnel.

## Pending / Next Steps
1. Rotate the exposed production DB password via the Supabase dashboard. Direct SQL is blocked: `ALTER ROLE postgres` returns `permission denied to alter role` because the pooler role is not a superuser. Update the DB secret after rotation; `.env.bak*`/compose backups are now mode 600 and must be cleaned after validation.
2. Verify the existing APK against the deployed backend on a real device/emulator; check Season selector + Prompt Studio tabs. Do not run Gradle locally.
3. Restart the Kaggle GPU worker or provide Kaggle credentials; then refresh `kaggle_sessions.api_endpoint` and run one controlled WF-03 smoke.
4. Re-run fixture validation only if prompt/season code changes again; keep fixtures isolated and clean up pgpass files.
