# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM); containers `ai-backend` and `n8n` healthy.
- ai-anime-android: `main` @ `27fccff`; Android Tests `43980517645` green after Maestro rerun; APK `43980517754` green.
- ai-anime-backend: `main` @ `75faa00`; Backend Tests `43984422766` green. Live container image `ec2-user-backend` predates the hybrid gateway and is not yet redeployed.
- anime-cpu-worker: `main` @ `ee47fdc`.
- n8n: 14 canonical StoryWF workflows active; WF-01/02/03/10 node/connection diffs previously verified 0.
- Anime central DB: `lqdjlcfczoyttagobega.supabase.co`; Auth DB: `icypjilkcqylgbpmkyes.supabase.co`.
- Migrations 007/008/009/010 applied. Migration `011_hybrid_byod_wallet.sql` is committed with rollback but NOT applied; its DSN/password is unavailable.
- Feature flags remain `ANIME_BYOD_ENABLED=false`, `ANIME_PLATFORM_DB_ENABLED=false`, `ANIME_PLATFORM_BILLING_ENABLED=false`.

## Recent Milestones (Rolling Window)
- [2026-11-17] Backend `75faa00` adds tenant-aware gateway: safe PostgREST-to-SQL translation for `anime_data`, project BYOD routing via `anime_tenant_project_index`, central fallback for global catalogs/`kaggle_sessions`, and system GET/PATCH/POST fan-out across central + active BYOD planes. Build and full local suites pass: 160 unit, 105 route, 135 static, 22 regression.
- [2026-11-17] Fixed system gateway writes injecting `project_id=system` into bodies (401 AUTH_INVALID). Writes now inject only for non-system project requests; system bodies are validated unchanged.
- [2026-11-16] Backend `b154413` adds encrypted tenant DB registry, DSN test/connect/health/provision/migrate/disconnect, owner registry/wallet visibility, and migration `011`; CI `43980517504` green.
- [2026-11-16] Android `27fccff` adds BYOD Database controls and owner registry/wallet UI; Android Tests green after a Maestro-only emulator flake; APK build green.
- [2026-11-16] Migration 010 applied: outbox lease recovery, `attempts >= 5` dead-lettering, 100-row payload redaction, and sensitive grant revocation.
- [2026-11-15] Migration 009 applied for per-user `kaggle_sessions`; old global row remains `user_id IS NULL` and is intentionally invisible to user scope.
- [2026-11-15] Gateway BYOK resolves the command user's decrypted provider key; system token matches between backend and n8n.

## Active State & Constraints
- TRUE BYOD DATABASE IS NOT LIVE YET: code is ready, flags are off, migration 011 is unapplied, and no BYOD test DSN exists.
- TRUE S3/CUSTOM STORAGE REMAINS PARTIAL: adapters/routes exist, but generation media still relies on Telegram/custom URLs.
- GitHub worker token is stored but not fully used by worker/workflows.
- Phase 4 cutover copies only `anime_data.projects`; seasons/scenes/episodes/prompts/memory copy and checksum verification are missing, so cutover stays disabled.
- Android cannot be built or run locally on this Termux host (no adb/emulator, memory constrained); verify only through GitHub Actions.
- Recreating `ai-backend` requires `--network ec2-user_default --network-alias backend` because n8n calls `http://backend:3000`.
- Do not use live `naagraj ek warrior` (`db2b78b3-d391-487b-81b2-83217216754e`) for destructive fixtures.
- Production DB password was previously exposed in chat; rotate via the Supabase dashboard (pooler role cannot alter the password), then update EC2 env.

## Pending / Next Steps
1. Apply migration 011 with an approved migration DSN; verify tables, RPCs, RLS, and rollback.
2. Deploy backend `75faa00` after 011, then verify central behavior is unchanged and `/health` is 200.
3. Connect a free test BYOD Postgres/Supabase DSN; test connect/health/provision/pause, then validate all 14 workflows on the BYOD plane.
4. Keep flags off until BYOD, cross-tenant denial, DB-down fail-closed, and key-rotation checks pass.
5. Extend Phase 4 to copy/checksum all project tables; finish Phase 6 owner filters/retry/actions.
6. Rotate the exposed production DB password and configure worker/Telegram credentials for a real generation smoke.
