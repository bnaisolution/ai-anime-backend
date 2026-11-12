# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM)
- ai-anime-android: `main` @ `5f0088a` | pushed to origin (Build APK ✅, Android Tests ✅)
- ai-backend: `main` @ `93e42da` | Container: Up (healthy, network `ec2-user_default`) | `/health` 200
- anime-cpu-worker: `main` @ `ee47fdc` | pushed to origin
- n8n Workflows: 14 Canonical active (WF-00 to WF-13) | 13 App Factory workflows untouched

## Recent Milestones (Rolling Window - Last 3)
- [2026-11-12] Batch A (commits `232e290`, `59e6f92`, `805c43a`): Home + delete + drawer always-expanded + back nav + AI FAB + badge.
- [2026-11-12] Batch B (commit `5f0088a`): Screen 1 fixes (dropdown restore, owner chip, health label, failed-job link) + Screen 2 fixes (16 callbacks wired, genre chips, medium, save-dirty, dynamic episode label). CI green.
- [2026-11-12] Screen 2 test: dead taps root-caused to unwired NavHost callbacks; now fixed. Backend delete `DELETE /v1/anime/projects/:id` live-verified (200/403).

## Active State & Next Immediate Action
- F2 status: 2.1 Home DONE; 2.2 Project Detail partially done (dead taps fixed, settings/gating pending). F2.3 Story Bible pending.
- Defects: B-16/B-17 FIXED (verify pending). B-07 (test data), B-09 (chip contrast), D2/D3/D5 OPEN.
- Next Action: user install kare `5f0088a` (APK run https://github.com/bnaisolution/ai-anime-android/actions/runs/43169281597 → latest run) build par; then re-run Screen 2 checklist (C-07..C-15 bhi implement pending).

## Pending / Next Steps
1. User install + retest: drawer dropdown, owner chip, back, badge, failed-job, Project Detail tiles, Settings.
2. Implement C-06 (cover upload), C-11/C-12/C-13 (generate preflight/pending screen), C-14 (control position), C-15 (episode duration/word).
3. Telegram test channel id wait (F9 publish).
4. F2 close karke F3 (Episodes) start.
