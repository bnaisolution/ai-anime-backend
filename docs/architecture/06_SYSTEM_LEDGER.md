# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM)
- ai-anime-android: `main` @ `8909993` (C-15 wiring fix; APK build green) | pushed to origin
- ai-backend: `main` @ `81e703a` (n8n callback/LLM fix published live + backend redeploy; C-15 live) | Container healthy, network `ec2-user_default` | `/health` 200
- anime-cpu-worker: `main` @ `ee47fdc` | pushed to origin
- n8n Workflows: 14 Canonical active (WF-00 to WF-13) | WF-00 imported/published live (`runOnceForAllItems`, 0 `$input.first`); 13 App Factory workflows untouched

## Recent Milestones (Rolling Window - Last 3)
- [2026-11-13] OpenCode intelligence upgrade (non-risky): global memory files, task registry, token baseline, 9 specialized agents, AGENTS.md memory protocol, project memory scaffold. Free usage limit hit during fresh-session validation (retry ~8.7h). No risky ops performed.
- [2026-11-13] Batch C follow-up: backend CI fixed (stale tests) + pushed at `39916c8`; Backend Tests green (`43412070136`). n8n error/success callback `$node.name` bug fixed in all 14 canonical workflows + WF-01 LLM model expressions -> updated + published live via n8n API. GPU runtime (dead tunnel) still pending.
- [2026-11-13] Runtime deploy (`918ac74`, `cc9fef5`): backend gateway scopes `projects` by `id`; WF-00 passes ingest `sessionId` as `command_id`; missing gateway token configured for n8n/backend; backend rebuilt and WF-00 imported/published. WF-00 executions now succeed.
- [2026-11-13] Audit vs `MASTER_COMPLETION_BLUEPRINT_FINAL` (2026-11-10): registry IDs now fully consistent (14/14), n8n credential boundary moved to backend gateway (`ANIME_WORKFLOW_GATEWAY_TOKEN`, no service-role/provider keys in JSON), callbacks+retry+stop nodes in all 14, worker signed auth, provider/model catalog, platform pool, key registry, S3 storage, Media3 playback implemented. Backend CI fix pushed at `39916c8`; WF-03 runtime error; release signing, DB restricted role/RLS, BYOI split, real replication, backup schedule still open.

## Active State & Next Immediate Action
- OpenCode intelligence implemented; fresh-session validation blocked by free usage limit (retry ~8.7h).
- Anime prep done: screen/button registry, WF-03 root cause, migration safety review, migration runbook, truth matrix. Backend safe tests: 138 pass, 0 fail with sibling mounts; one workflow reliability failure is design conflict (Stage 1A fallback vs direct error callback). Security: env backup perms fixed (chmod 600), DB backup script added. No production changes.
- Approval still required for risky ops (PAT, port, migrations, redeploy).
- F2 status: 2.1 Home DONE; 2.2 Project Detail source-complete; 2.3 Story Bible source audit DONE — P0 AI Expand data-loss + false-success + Living Canon gap; report `docs/audit/master-system/SCREEN3_STORY_BIBLE_AUDIT_2026-11-14.md`; implementation awaiting approval.
- Defects: B-16/B-17 FIXED (verify pending). B-07, B-09, B-18..B-22, D2/D3/D5 OPEN.
- NEXT: owner approval for Screen 3 Phase 0/1 fixes + security remediation + migration plan; then WF-03 fix and runtime validation.

## Pending / Next Steps
1. Owner approval: PAT rotation, port restriction, file perms, DB migration apply, backend redeploy.
2. Validate OpenCode memory in fresh session after free limit resets (~8.7h); record before/after tokens.
3. Anime: DB backup/rollback plan, then apply 003/004/005/006 (approval required).
4. Anime: fix n8n WF-03 (GPU tunnel + $node.name callbacks) and verify.
5. Anime: Android secure token storage + screen/button test registry.
6. Later: BYOI split, replication, worker deploy, GPU, Telegram, backup drill, signing, E2E.
