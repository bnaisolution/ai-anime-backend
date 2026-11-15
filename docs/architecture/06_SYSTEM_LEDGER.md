# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM)
- ai-anime-android: `main` @ `79ebe23` (dynamic genre/medium UI + CI test fixes) | APK CI green (`43742858229`), Android Tests green (`43742858203`)
- ai-backend: `main` @ `5a3545d` (season keys + dynamic creative prompts) | live container `anime-backend:5a3545d`, network alias `backend`, health 200
- anime-cpu-worker: `main` @ `ee47fdc` | pushed to origin
- n8n Workflows: canonical WF-01 (`UeEXeimGGwqIh84T`), WF-02 (`qRUdhg1PNDK2wJk6`), WF-03 (`s4RGuFSDlevgD5nC`), WF-10 (`swOEbQV3iNUNmMwu`) live, active, node/connection diff 0 vs repo
- Migration 007: applied to production; backup `anime-prod-20261115T182315Z.dump` sha256 `b9949f118acff44482fd665b12fe457b03ea264d111a8b7b58c41d69af2f4050`

## Recent Milestones (Rolling Window - Last 3)
- [2026-11-15] Migration 007 applied transactionally after `pg_dump`: all four tables now have `season_no NOT NULL DEFAULT 1`; legacy unique constraints + standalone unique indexes removed; dual-season insert smoke passed and rolled back; live Nagraj config/row counts unchanged.
- [2026-11-15] Backend `5a3545d` deployed (`Backend Tests` `43746994533` success); fixed WF-02 duplicate scene key, WF-10 season state upsert, and GPU clip checkpoint `on_conflict`; restored n8n→`backend` DNS alias; `/health` 200.
- [2026-11-15] WF-01/WF-02/WF-03/WF-10 imported via n8n `PUT`, reactivated, and verified `active=true` with zero node/connection drift. Live `naagraj ek warrior` remains untouched.
- [2026-11-13] OpenCode intelligence upgrade (non-risky): global memory files, task registry, token baseline, 9 specialized agents, AGENTS.md memory protocol, project memory scaffold. Free usage limit hit during fresh-session validation (retry ~8.7h). No risky ops performed.
- [2026-11-13] Batch C follow-up: backend CI fixed (stale tests) + pushed at `39916c8`; Backend Tests green (`43412070136`). n8n error/success callback `$node.name` bug fixed in all 14 canonical workflows + WF-01 LLM model expressions -> updated + published live via n8n API. GPU runtime (dead tunnel) still pending.
- [2026-11-13] Runtime deploy (`918ac74`, `cc9fef5`): backend gateway scopes `projects` by `id`; WF-00 passes ingest `sessionId` as `command_id`; missing gateway token configured for n8n/backend; backend rebuilt and WF-00 imported/published. WF-00 executions now succeed.
- [2026-11-13] Audit vs `MASTER_COMPLETION_BLUEPRINT_FINAL` (2026-11-10): registry IDs now fully consistent (14/14), n8n credential boundary moved to backend gateway (`ANIME_WORKFLOW_GATEWAY_TOKEN`, no service-role/provider keys in JSON), callbacks+retry+stop nodes in all 14, worker signed auth, provider/model catalog, platform pool, key registry, S3 storage, Media3 playback implemented. Backend CI fix pushed at `39916c8`; WF-03 runtime error; release signing, DB restricted role/RLS, BYOI split, real replication, backup schedule still open.

## Active State & Next Immediate Action
- Migration 007 and backend/workflow deployment are live. `npm run test:static` = 119/119; packaged creative registry smoke = 14 genres, 8 mediums, `Action / Fantasy` → `Action Fantasy`, `MANHWA` resolved.
- Any future `ai-backend` recreation MUST include `--network ec2-user_default --network-alias backend`; workflows fall back to `http://backend:3000` and n8n has no URL override.
- Production DB password was shared in chat and used for migration. Rotate it after validation, then update EC2 backend env; temporary `~/.pgpass.anime-migrate` was removed.
- Live `naagraj ek warrior` (`db2b78b3-d391-487b-81b2-83217216754e`) config/row counts unchanged; do not use it for destructive test fixtures.
- PAT rotation, port restriction, restricted DB role/RLS, WF-03 GPU runtime, release signing remain open.
- NEXT: isolated fixture validation for dynamic genre/medium + S1/S2 identity, then Android APK verification.

## Pending / Next Steps
1. Create isolated fixture project/user; validate creative prompt resolution, S1E1/S2E1 reuse, and backend read/upsert paths without touching live Nagraj.
2. Rotate the exposed production DB password and update backend/EC2 secrets.
3. Restore WF-03 GPU tunnel/runtime and run one controlled production smoke.
4. Verify APK against deployed backend with isolated fixture; keep Gradle delegated to GitHub Actions.
