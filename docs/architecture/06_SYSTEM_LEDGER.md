# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM)
- ai-anime-android: `main` @ `68d84dd696c2b15dc5ea8a22bafce6c3ec58fdff` | pushed to origin
- ai-backend: `main` @ `5a8dc7e009589af71c70ef2b1961f2bb3a56d505` + docs commits | Container: Up (healthy) | Master Auth Live (HTTP 200)
- anime-cpu-worker: `main` @ `ee47fdceeba1ae89236d8b6bad0590681827dc5d` | pushed to origin
- n8n Workflows: 14 Canonical active (WF-00 to WF-13) | 6 duplicate Story workflows purged

## Recent Milestones (Rolling Window - Last 3)
- [2026-11-11] Master auth unblocked: `admin@example.com` login HTTP 200, refresh HTTP 200, `/auth/me` 200.
- [2026-11-11] Runtime validation (API layer): auth suite 11/11 expected, n8n 14/14 canonical active, defects opened.
- [2026-11-12] DB migrations 003/004/005/006 applied to anime project; owner endpoints 200, normal user 403 (RBAC verified). Telegram bot token configured; `testuser@example.com` password set.

## Active State & Next Immediate Action
- Current Status: D1 FIXED (owner/pool endpoints 200, RBAC 403 for normal user). D2 open (access token valid ~1h after logout). D3 open (worker CI failed only at `upload-artifact` step; rerun blocked by `startup_failure`). D4 partial (bot token set, test channel missing). D5 open (`workspace_id` empty in `/auth/me` for normal user).
- Next Action: Provide/confirm Telegram test channel for publish test, re-run worker CI once GitHub recovers, then feature-wise runtime testing with user.
