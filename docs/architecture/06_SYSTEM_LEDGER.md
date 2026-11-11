# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM)
- ai-anime-android: `main` @ `68d84dd696c2b15dc5ea8a22bafce6c3ec58fdff` | pushed to origin
- ai-backend: `main` @ `5a8dc7e009589af71c70ef2b1961f2bb3a56d505` + docs commits | Container: Up (healthy) | Master Auth Live (HTTP 200)
- anime-cpu-worker: `main` @ `ee47fdceeba1ae89236d8b6bad0590681827dc5d` | pushed to origin
- n8n Workflows: 14 Canonical active (WF-00 to WF-13) | 6 duplicate Story workflows purged

## Recent Milestones (Rolling Window - Last 3)
- [2026-11-11] All Batches (1-5) successfully merged into main branch across all services.
- [2026-11-11] Master auth unblocked: `admin@example.com` login HTTP 200, refresh HTTP 200, `/auth/me` 200.
- [2026-11-11] Runtime validation (API layer): auth suite 11/11 expected, n8n 14/14 canonical active, 2 defects opened (owner 500, logout token).

## Active State & Next Immediate Action
- Current Status: Login live on `icypjilkcqylgbpmkyes` (Manager project) using `sb_publishable_...` key. Defect D1: `/v1/anime/owner/quota` + `/tenants` return 500 (tenant tables not migrated). Defect D2: logout revokes refresh token but access token stays valid until expiry (~1h). `ANIME_SUPABASE_ANON_KEY` still placeholder.
- Next Action: Apply `supabase/migrations/005_batch4_tenant_platform.sql` to anime project (fixes `/v1/anime/owner/*` 500), then E2E pipeline smoke test & release APK.
