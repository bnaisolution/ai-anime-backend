# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM); containers `ai-backend` and `n8n` healthy.
- ai-anime-android: `main` @ `cf89354` (code `d0de7cb`); Android Tests `44011671586` green; APK `44011671588` green.
- ai-anime-backend: `main` @ `ad84103`; Backend Tests `44032610738` green. Live container `ai-backend` runs `anime-backend:ad84103`, health 200, network alias `backend`; rollback tags `anime-backend:rollback-pre-ad84103` and `ec2-user-backend:rollback-pre-71c1e0d`.
- anime-cpu-worker: `main` @ `ee47fdc`.
- n8n: 14 canonical StoryWF workflows active; WF-01/02/03/10 node/connection diffs previously verified 0.
- Anime central DB: `lqdjlcfczoyttagobega.supabase.co`; Auth DB: `icypjilkcqylgbpmkyes.supabase.co`.
- Migrations 007/008/009/010 applied. Migration `011_hybrid_byod_wallet.sql` is committed with rollback but NOT applied; its DSN/password is unavailable.
- Feature flags remain `ANIME_BYOD_ENABLED=false`, `ANIME_PLATFORM_DB_ENABLED=false`, `ANIME_PLATFORM_BILLING_ENABLED=false`.

## Recent Milestones (Rolling Window)
- [2026-11-17] BYOD test project `Test BYOD` (`cnooyjoeymbuvfxnlfjs`) validated: direct host is IPv6-only and unreachable from EC2; pooler `aws-0-ap-northeast-1.pooler.supabase.com` works. Tenant schema v2 applied (31 tables incl `schema_migrations`), reapply idempotent, backend `testTenantDsn` returns ok. Backend `ad84103` fixes `pg` overriding explicit TLS options; local suite 169 unit, 109 route, 136 static, 22 regression; deployed and healthy.
- [2026-11-17] Backend `71c1e0d` deployed to EC2 as `anime-backend:71c1e0d`; `/health` 200, n8n reaches `http://backend:3000`, test-account login/projects/prompt-meta pass, hybrid routes return 401 unauthenticated. Migration `011` remains unapplied and BYOD flags remain off.
- [2026-11-17] Backend `71c1e0d` provisions all 30 gateway project tables, copies every project table except transient `pending_actions`, verifies row counts, enforces a 7-day central rollback window, and adds owner schema repair. Local PostgreSQL 18.6 create/upgrade/copy checks passed. Android `d0de7cb` adds the repair action. Full backend suite: 168 unit, 108 route, 136 static, 22 regression; Android Tests and APK green.
- [2026-11-17] Backend `ec782e2` adds owner tenant-DB filters (`status`/`mode`/`provider`/host), audit preview, health recheck, and read-only environment feature status. Android `ca02e21` adds the filter/audit/recheck UI.
- [2026-11-17] Backend `75faa00` adds tenant-aware gateway: safe PostgREST-to-SQL translation for `anime_data`, project BYOD routing via `anime_tenant_project_index`, central fallback for global catalogs/`kaggle_sessions`, and system GET/PATCH/POST fan-out across central + active BYOD planes.
- [2026-11-17] Fixed system gateway writes injecting `project_id=system` into bodies (401 AUTH_INVALID). Writes now inject only for non-system project requests; system bodies are validated unchanged.
- [2026-11-16] Backend `b154413` adds encrypted tenant DB registry, DSN test/connect/health/provision/migrate/disconnect, owner registry/wallet visibility, and migration `011`; CI `43980517504` green.
- [2026-11-16] Android `27fccff` adds BYOD Database controls and owner registry/wallet UI; Android Tests green after a Maestro-only emulator flake; APK build green.
- [2026-11-16] Migration 010 applied: outbox lease recovery, `attempts >= 5` dead-lettering, 100-row payload redaction, and sensitive grant revocation.
- [2026-11-15] Migration 009 applied for per-user `kaggle_sessions`; old global row remains `user_id IS NULL` and is intentionally invisible to user scope.
- [2026-11-15] Gateway BYOK resolves the command user's decrypted provider key; system token matches between backend and n8n.

## Active State & Constraints
- TRUE BYOD DATABASE IS NOT LIVE YET: backend code is deployed and a `Test BYOD` data-plane database exists with schema v2, but central migration 011 is still unapplied and feature flags remain off. Direct Supabase DB hosts are IPv6-only; use the project pooler DSN from EC2.
- TRUE S3/CUSTOM STORAGE REMAINS PARTIAL: adapters/routes exist, but generation media still relies on Telegram/custom URLs.
- GitHub worker token is stored but not fully used by worker/workflows.
- Phase 4 cutover copies all 30 project tables with idempotent upserts and per-table row-count verification; cryptographic checksums are not implemented, so live cutover remains disabled until BYOD testing.
- Android cannot be built or run locally on this Termux host (no adb/emulator, memory constrained); verify only through GitHub Actions.
- Recreating `ai-backend` requires `--network ec2-user_default --network-alias backend` because n8n calls `http://backend:3000`.
- Do not use live `naagraj ek warrior` (`db2b78b3-d391-487b-81b2-83217216754e`) for destructive fixtures.
- Production DB password was previously exposed in chat; rotate via the Supabase dashboard (pooler role cannot alter the password), then update EC2 env.

## Pending / Next Steps
1. Apply migration 011 with an approved migration DSN; verify tables, RPCs, RLS, and rollback.
2. Use the validated `Test BYOD` pooler DSN to test connect/health/provision/copy/pause after 011; then validate all 14 workflows on the BYOD plane.
3. Keep flags off until BYOD, live cross-tenant denial, DB-down fail-closed, and key-rotation checks pass.
4. Finish Phase 6 per-project migration retry and runtime toggles; run pause/rotation/restore drills.
5. Rotate the exposed production DB password and configure worker/Telegram credentials for a real generation smoke.
