# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM)
- ai-anime-android: `main` @ `79ebe23` (dynamic genre/medium UI + CI test fixes) | APK CI green (`43742858229`), Android Tests green (`43742858203`)
- ai-backend: `main` @ `0bd930e` (project genre precedence fix) | live container `anime-backend:0bd930e`, network alias `backend`, health 200; Backend Tests `43749010661` success
- anime-cpu-worker: `main` @ `ee47fdc` | pushed to origin
- n8n Workflows: canonical WF-01 (`UeEXeimGGwqIh84T`), WF-02 (`qRUdhg1PNDK2wJk6`), WF-03 (`s4RGuFSDlevgD5nC`), WF-10 (`swOEbQV3iNUNmMwu`) live, active, node/connection diff 0 vs repo
- Migration 007: applied to production; backup `anime-prod-20261115T182315Z.dump` sha256 `b9949f118acff44482fd665b12fe457b03ea264d111a8b7b58c41d69af2f4050`
- Migration 008: applied to production; prompt-library medium check now allows `ANIME`, `MANHWA`, `3D`, `2D_ANIMATION`, `REAL_HUMAN`, `LIVE_ACTION`, `CINEMATIC`, `HYBRID`

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
- Migration 007/008, backend `0bd930e`, and workflow deployment are live. `npm run test:static` = 119/119; packaged creative registry smoke = 14 genres, 8 mediums, `Action / Fantasy` → `Action Fantasy`, `MANHWA` resolved.
- Fixture validation is complete and cleaned up: 0 fixture projects/prompts remain; live Nagraj episodes/states/scenes/clips remain 0 and its config is unchanged.
- Any future `ai-backend` recreation MUST include `--network ec2-user_default --network-alias backend`; workflows fall back to `http://backend:3000` and n8n has no URL override.
- Production DB password was shared in chat and used for migrations. Rotate it after validation, then update EC2 backend env; both temporary pgpass files were removed.
- Live `naagraj ek warrior` (`db2b78b3-d391-487b-81b2-83217216754e`) config/row counts unchanged; do not use it for destructive test fixtures.
- WF-03 is still blocked: `kaggle_sessions.kaggle_story_engine` points at `https://travelers-individual-parameter-entertainment.trycloudflare.com` from 2026-09-30, and every `/health`, `/v1/health`, `/docs`, `/` probe fails. No Kaggle credentials are stored in the live user's infrastructure, so the tunnel cannot be restarted from EC2.
- Android runtime verification is blocked locally: no `adb` or emulator is installed/connected. APK artifact remains `anime-debug-apk` from `Build Anime APK` run `43742858229` (`79ebe23`).
- PAT rotation, port restriction, restricted DB role/RLS, WF-03 GPU runtime, release signing remain open.
- NEXT: provide a device/emulator for APK verification and restart the Kaggle GPU worker (or supply Kaggle credentials) to refresh the WF-03 tunnel.

## Pending / Next Steps
1. Rotate the exposed production DB password and update backend/EC2 secrets.
2. Verify the existing APK against the deployed backend on a real device/emulator; check Season selector + Prompt Studio tabs. Do not run Gradle locally.
3. Restart the Kaggle GPU worker or provide Kaggle credentials; then refresh `kaggle_sessions.api_endpoint` and run one controlled WF-03 smoke.
4. Re-run fixture validation only if prompt/season code changes again; keep fixtures isolated and clean up pgpass files.
