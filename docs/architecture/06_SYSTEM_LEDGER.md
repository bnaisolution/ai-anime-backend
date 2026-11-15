# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM)
- ai-anime-android: `main` @ `79ebe23` (dynamic genre/medium UI + CI test fixes) | APK CI green (`43742858229`), Android Tests green (`43742858203`)
- ai-backend: `main` @ `2614dd9` (creative prompts + season identity + workflow fallback test fix) | live container still `anime-backend:64b73ef`
- anime-cpu-worker: `main` @ `ee47fdc` | pushed to origin
- n8n Workflows: canonical `StoryWF-01` (`UeEXeimGGwqIh84T`) live; WF-02/WF-03 dynamic-prompt patches committed but not deployed

## Recent Milestones (Rolling Window - Last 3)
- [2026-11-15] Android dynamic genre/medium prompt work CI green at `79ebe23`; backend season-aware work + workflow reliability fix green at `2614dd9` (`43744749249`). Migration 007/deploy pending.
- [2026-11-15] Live DB probe: `episodes.season_no` exists; `episode_states`, `scenes`, `clips` lack `season_no`; no DB URL/password available on EC2/local to back up or apply migration 007.
- [2026-11-15] Screen 3 deployed: backend `effff5e` + route-registration fix `64b73ef`; canonical WF-01 replaced live with 24-node patch-only flow; Android CI green at `7c3b281`. Rollback tags: `ec2-user-backend:rollback-cf44557`, `anime-backend:rollback-effff5e`.
- [2026-11-13] OpenCode intelligence upgrade (non-risky): global memory files, task registry, token baseline, 9 specialized agents, AGENTS.md memory protocol, project memory scaffold. Free usage limit hit during fresh-session validation (retry ~8.7h). No risky ops performed.
- [2026-11-13] Batch C follow-up: backend CI fixed (stale tests) + pushed at `39916c8`; Backend Tests green (`43412070136`). n8n error/success callback `$node.name` bug fixed in all 14 canonical workflows + WF-01 LLM model expressions -> updated + published live via n8n API. GPU runtime (dead tunnel) still pending.
- [2026-11-13] Runtime deploy (`918ac74`, `cc9fef5`): backend gateway scopes `projects` by `id`; WF-00 passes ingest `sessionId` as `command_id`; missing gateway token configured for n8n/backend; backend rebuilt and WF-00 imported/published. WF-00 executions now succeed.
- [2026-11-13] Audit vs `MASTER_COMPLETION_BLUEPRINT_FINAL` (2026-11-10): registry IDs now fully consistent (14/14), n8n credential boundary moved to backend gateway (`ANIME_WORKFLOW_GATEWAY_TOKEN`, no service-role/provider keys in JSON), callbacks+retry+stop nodes in all 14, worker signed auth, provider/model catalog, platform pool, key registry, S3 storage, Media3 playback implemented. Backend CI fix pushed at `39916c8`; WF-03 runtime error; release signing, DB restricted role/RLS, BYOI split, real replication, backup schedule still open.

## Active State & Next Immediate Action
- OpenCode intelligence implemented; fresh-session validation blocked by free usage limit (retry ~8.7h).
- Backend static reliability test now follows bounded provider fallbacks; `npm run test:static` passes 119/119.
- Migration 007 needs a production DB URL/password for `pg_dump` backup and `psql -v ON_ERROR_STOP=1 -1`; no direct DB URL exists in EC2 env, local env, or repo secrets.
- Do not deploy backend/WF-02/WF-03 before migration 007; season-aware reads/upserts expect missing columns.
- PAT rotation, port restriction, restricted DB role/RLS, WF-03 GPU runtime, release signing remain open.
- NEXT: load DB URL securely, back up, apply 007, verify constraints/indexes, deploy backend + WF-02/WF-03, then isolated fixture validation.

## Pending / Next Steps
1. Provide production DB URL/password securely or apply `007_season_episode_identity.sql` via Supabase SQL editor.
2. Back up with `pg_dump -Fc`, apply 007 transactionally, verify columns/constraints/indexes.
3. Rebuild backend image at `2614dd9`, recreate `ai-backend` on `ec2-user_default`, import/publish WF-02/WF-03.
4. Verify dynamic genre/medium + season fixture without touching live Nagraj canon.
