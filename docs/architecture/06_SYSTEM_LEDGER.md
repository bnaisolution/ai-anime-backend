# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM)
- ai-anime-android: `main` @ `232e290` | pushed to origin
- ai-backend: `main` @ `805c43a` | Container: Up (healthy, network `ec2-user_default`) | `/health` 200
- anime-cpu-worker: `main` @ `ee47fdc` | pushed to origin
- n8n Workflows: 14 Canonical active (WF-00 to WF-13) | 13 App Factory workflows untouched

## Recent Milestones (Rolling Window - Last 3)
- [2026-11-12] F2.1 Home screen runtime-tested by user: create/refresh/select/production-popup/approvals/bottom tabs all PASS.
- [2026-11-12] Batch 1+2 shipped: drawer always-expanded, back nav everywhere, AI FAB on Home, `AI: <provider>` badge Home-only, project delete (backend + Android confirm dialog), DB-driven season/episode, human-readable statuses.
- [2026-11-12] `DELETE /v1/anime/projects/:id` verified live: owner 200 (row removed, cascade), normal user 403, second delete 403. Backend CI `805c43a` success.

## Active State & Next Immediate Action
- F2 status: 2.1 Home DONE (fixes in APK build). 2.2 Project Detail + 2.3 Story Bible READY FOR TEST (checklists in `docs/testing/screens/`).
- Defects: B-01..B-06/B-08/B-10..B-15 FIXED (verify pending), B-07 (test data) + B-09 (chip contrast) OPEN. D2, D3, D5 OPEN.
- Next Action: wait for Android CI `232e290` (unit tests + Build APK), hand APK to user, then run F2.2 (`F2-PROJECT-DETAIL.md`) and F2.3 (`F2-BIBLE.md`). Telegram test channel id still needed before F9.
