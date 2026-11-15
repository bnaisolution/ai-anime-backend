# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM)
- ai-anime-android: `main` @ `7c3b281` (Screen 3 safe patch UI + CI test fixes) | APK CI green (`43683474414`), Android Tests green (`43683477477`)
- ai-backend: `main` @ `64b73ef` (Screen 3 patch lifecycle + atomic prompt activation) | live container `anime-backend:64b73ef`, network `ec2-user_default`, `/health` 200
- anime-cpu-worker: `main` @ `ee47fdc` | pushed to origin
- n8n Workflows: canonical `StoryWF-01` (`UeEXeimGGwqIh84T`) updated live: 24 nodes, active, patch-only, no direct `story_bible` writer; pre-update backup in `~/backups/StoryWF-01-20261115T065839Z.json`

## Recent Milestones (Rolling Window - Last 3)
- [2026-11-15] Screen 3 deployed: backend `effff5e` + route-registration fix `64b73ef`; canonical WF-01 replaced live with 24-node patch-only flow; Android CI green at `7c3b281`. Rollback tags: `ec2-user-backend:rollback-cf44557`, `anime-backend:rollback-effff5e`.
- [2026-11-13] OpenCode intelligence upgrade (non-risky): global memory files, task registry, token baseline, 9 specialized agents, AGENTS.md memory protocol, project memory scaffold. Free usage limit hit during fresh-session validation (retry ~8.7h). No risky ops performed.
- [2026-11-13] Batch C follow-up: backend CI fixed (stale tests) + pushed at `39916c8`; Backend Tests green (`43412070136`). n8n error/success callback `$node.name` bug fixed in all 14 canonical workflows + WF-01 LLM model expressions -> updated + published live via n8n API. GPU runtime (dead tunnel) still pending.
- [2026-11-13] Runtime deploy (`918ac74`, `cc9fef5`): backend gateway scopes `projects` by `id`; WF-00 passes ingest `sessionId` as `command_id`; missing gateway token configured for n8n/backend; backend rebuilt and WF-00 imported/published. WF-00 executions now succeed.
- [2026-11-13] Audit vs `MASTER_COMPLETION_BLUEPRINT_FINAL` (2026-11-10): registry IDs now fully consistent (14/14), n8n credential boundary moved to backend gateway (`ANIME_WORKFLOW_GATEWAY_TOKEN`, no service-role/provider keys in JSON), callbacks+retry+stop nodes in all 14, worker signed auth, provider/model catalog, platform pool, key registry, S3 storage, Media3 playback implemented. Backend CI fix pushed at `39916c8`; WF-03 runtime error; release signing, DB restricted role/RLS, BYOI split, real replication, backup schedule still open.

## Active State & Next Immediate Action
- OpenCode intelligence implemented; fresh-session validation blocked by free usage limit (retry ~8.7h).
- Anime prep done: screen/button registry, WF-03 root cause, migration safety review, migration runbook, truth matrix. Backend safe tests: 138 pass, 0 fail with sibling mounts; one workflow reliability failure is design conflict (Stage 1A fallback vs direct error callback). Security: env backup perms fixed (chmod 600), DB backup script added. No production changes.
- Approval still required for PAT rotation, port restriction, and DB migrations; Screen 3 backend redeploy completed 2026-11-15.
- F2 status: 2.1 Home DONE; 2.2 Project Detail source-complete; 2.3 Story Bible source + backend + n8n deployed; runtime APK validation pending.
- WF-09 unchanged by design: canon check/mutation engine already exists; Screen 3 patch approvals use WF-01 only. Canon Viewer manual commit payload mismatch remains open.
- Defects: B-16/B-17 FIXED (verify pending). B-07, B-09, B-18..B-22, D2/D3/D5 OPEN.
- NEXT: install Screen 3 APK and verify patch approve/reject + prompt activation against live backend; then WF-03 fix.

## Pending / Next Steps
1. Owner approval: PAT rotation, port restriction, file perms, DB migration apply.
2. Validate OpenCode memory in fresh session after free limit resets (~8.7h); record before/after tokens.
3. Anime: DB backup/rollback plan, then apply 003/004/005/006 (approval required).
4. Anime: fix n8n WF-03 (GPU tunnel + $node.name callbacks) and verify.
5. Anime: Android secure token storage + screen/button test registry.
6. Later: BYOI split, replication, worker deploy, GPU, Telegram, backup drill, signing, E2E.
