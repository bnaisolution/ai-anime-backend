# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM)
- ai-anime-android: `main` @ `b0c350f` | pushed to origin (APK build green; device verification pending)
- ai-backend: `main` @ `4265de4` | Container: Up (healthy, network `ec2-user_default`) | `/health` 200
- anime-cpu-worker: `main` @ `ee47fdc` | pushed to origin
- n8n Workflows: 14 Canonical active (WF-00 to WF-13) | 13 App Factory workflows untouched; repo WF-00 fix import pending

## Recent Milestones (Rolling Window - Last 3)
- [2026-11-12] Batch A (commits `232e290`, `59e6f92`, `805c43a`): Home + delete + drawer always-expanded + back nav + AI FAB + badge.
- [2026-11-12] Batch B (commit `5f0088a`): Screen 1 fixes (dropdown restore, owner chip, health label, failed-job link) + Screen 2 fixes (16 callbacks wired, genre chips, medium, save-dirty, dynamic episode label). CI green.
- [2026-11-13] Batch C (commit `af59393`, follow-ups `38a830e`/`c6c1001`/`b0c350f`, backend `06f2a88`→`4265de4`): cover upload via storage/upload, readiness preflight screen, readiness-gated dynamic episode generation, Production Control moved below Studio Modules, WF-00 Code nodes made all-items safe, `PUBLISH_NOW` routed to WF-07. APK build + Android Tests green on `b0c350f`.

## Active State & Next Immediate Action
- F2 status: 2.1 Home DONE; 2.2 Project Detail source-complete (device verify pending); F2.3 Story Bible pending.
- Defects: B-16/B-17 FIXED (verify pending). B-07 (test data), B-09 (chip contrast), D2/D3/D5 OPEN.
- Next Action: install the green `b0c350f` APK on a device, run the Screen 2 checklist, then import updated WF-00 into n8n.

## Pending / Next Steps
1. Android device retest: cover upload, readiness/preflight, generation gating, Studio module taps (APK from `b0c350f` run).
2. Import/update WF-00 in running n8n and verify no `$input.first()` per-item errors.
3. Implement C-15 (episode duration + script word count).
4. Telegram test channel id wait (F9 publish).
5. F2 close karke F3 (Episodes) start.
