# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM)
- ai-anime-android: `main` @ `e875db3` (C-15 generation settings wiring) | pushed to origin (APK build running)
- ai-backend: `main` @ `81e703a` (n8n callback/LLM fix published live + backend redeploy; C-15 live) | Container healthy, network `ec2-user_default` | `/health` 200
- anime-cpu-worker: `main` @ `ee47fdc` | pushed to origin
- n8n Workflows: 14 Canonical active (WF-00 to WF-13) | WF-00 imported/published live (`runOnceForAllItems`, 0 `$input.first`); 13 App Factory workflows untouched

## Recent Milestones (Rolling Window - Last 3)
- [2026-11-13] Batch C (commit `af59393`, follow-ups `38a830e`/`c6c1001`/`b0c350f`): cover upload via storage/upload, readiness preflight screen, readiness-gated dynamic episode generation, Production Control moved below Studio Modules, WF-00 Code nodes made all-items safe, `PUBLISH_NOW` routed to WF-07. APK build + Android Tests green on `b0c350f`.
- [2026-11-13] Batch C follow-up: backend CI fixed (stale tests) + pushed at `39916c8`; Backend Tests green (`43412070136`). n8n error/success callback `$node.name` bug fixed in all 14 canonical workflows + WF-01 LLM model expressions -> updated + published live via n8n API. GPU runtime (dead tunnel) still pending.
- [2026-11-13] Runtime deploy (`918ac74`, `cc9fef5`): backend gateway scopes `projects` by `id`; WF-00 passes ingest `sessionId` as `command_id`; missing gateway token configured for n8n/backend; backend rebuilt and WF-00 imported/published. WF-00 executions now succeed.
- [2026-11-13] Audit vs `MASTER_COMPLETION_BLUEPRINT_FINAL` (2026-11-10): registry IDs now fully consistent (14/14), n8n credential boundary moved to backend gateway (`ANIME_WORKFLOW_GATEWAY_TOKEN`, no service-role/provider keys in JSON), callbacks+retry+stop nodes in all 14, worker signed auth, provider/model catalog, platform pool, key registry, S3 storage, Media3 playback implemented. Backend CI fix pushed at `39916c8`; WF-03 runtime error; release signing, DB restricted role/RLS, BYOI split, real replication, backup schedule still open.

## Active State & Next Immediate Action
- F2 status: 2.1 Home DONE; 2.2 Project Detail source-complete; 2.3 Story Bible screen exists (`BibleScreen.kt`), wiring/verify pending.
- Defects: B-16/B-17 FIXED (verify pending). B-07 (test data), B-09 (chip contrast), D2/D3/D5 OPEN.
- Phase B status (2026-11-13): DONE except owner-blocked DB migration apply. CI fix pushed+green; n8n `$node.name`/LLM fix published live; backend redeployed; C-15 Android wiring committed (`e875db3`). NEXT: DB migrations 003/005/006 apply + owner endpoints verify; then GPU worker deploy → WF-03 re-run; Phase C/D. Android APK for retest = run `43368507933` (artifact `anime-debug-apk`, `b0c350f`).

## Pending / Next Steps
1. Android: reinstall APK from run `43368507933` (`b0c350f`), retest Screen 1/2; log only failures that reproduce.
2. Backend CI: fixed stale assertions (gateway `id=eq` scope, WF-02 `$env.WF_03_PROD_ID` dispatch, auth 503 category) -> push and confirm green.
3. WF-03 live error (last 4 runs) -> fix media pipeline; then WF-01/04/05/07/08/10/11 runtime.
4. DB: apply 003/005/006 (owner tables missing -> Owner Overview 500), restricted role + RLS (B1-10).
5. C-15 complete: `normalizeGenerationSetting` helper, columns/migration, Android fields.
6. Later: BYOI split (B4-03), real replication (B4-07), worker deploy (B3-07), GPU (B3-05), Telegram (B3-10), chat streaming (B3-14), backup drill (B4-22), signing (B4-23), E2E (B4-15).
