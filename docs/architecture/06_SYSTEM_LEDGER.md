# SYSTEM STATE LEDGER (Single Source of Truth)

## Current Heads & Infrastructure
- Host: AWS EC2 t3.small (1.9 GB RAM); containers `ai-backend` and `n8n` healthy.
- ai-anime-android: code `d0de7cb`, docs `main` @ `ac14492`; Android Tests `44054066519` green; APK `44054066825` green. The earlier `d1c6ee4` Maestro failure was a `stopApp` + `launchApp clearState` race; `ac14492` removes the redundant `stopApp`.
- ai-anime-backend: code `fd64916`, docs `main` @ `e33ed06`; Backend Tests `44047559530` green (docs-only `e33ed06` CI `44054111591` green). Live container `ai-backend` runs `anime-backend:fd64916`, health 200, network alias `backend`; rollback tags `anime-backend:rollback-pre-fd64916`, `anime-backend:rollback-pre-ad84103`, and `ec2-user-backend:rollback-pre-71c1e0d`.
- anime-cpu-worker: `main` @ `ee47fdc`.
- n8n: 14 canonical StoryWF workflows active; WF-01/02/03/10 node/connection diffs previously verified 0.
- Anime central DB: `lqdjlcfczjottagobega.supabase.co` (DNS verified; `lqdjlcfczoyttagobega` does not resolve); Auth DB: `icypjilkcqylgbpmkyes.supabase.co`.
- Migrations 007/008/009/010/011 applied. Migration `011_hybrid_byod_wallet.sql` was applied through `aws-0-ap-south-1.pooler.supabase.com`; tenant registry/audit/index/wallet tables and wallet RPCs exist.
- Runtime BYOD is enabled (`ANIME_BYOD_ENABLED=true`); DB seed flags remain `byod_enabled=false`, `platform_db_enabled=false`, `platform_billing_enabled=false`.

## Recent Milestones (Rolling Window)
- [2026-11-17] Live BYOD validation passed for the dedicated test account: created tenant `f91f5074-08c0-4f47-925c-8ad1ae7a5fa1`, connected `Test BYOD` through the pooler, verified health/schema v2, then migrated, rolled back, and re-migrated smoke project `d946a6a6-02e3-45b4-9a88-61674a186306`. Central index switched to `byod` and back; BYOD copy contains the project row. All 14 workflows remain unvalidated on this plane.
- [2026-11-17] Migration `011` applied live via the South Asia pooler; registry/audit/project-index/wallet-ledger tables, wallet RPCs, RLS, and flag columns verified. Test account now has an owner membership and `GET /v1/anime/tenants/me/database` returns `mode=byod`, `status=active`, `dsn_configured=true`, `schema_version=2`, `byod_enabled=true`.
- [2026-11-17] Backend `fd64916` fixes the second TLS path: the workflow gateway now uses `tenantClientConnection()` so `sslmode=require` cannot override explicit BYOD TLS options. CI `44047559530` green; deployed as `anime-backend:fd64916`; live gateway read from the BYOD plane returns the smoke project.
- [2026-11-17] BYOD test project `Test BYOD` (`cnooyjoeymbuvfxnlfjs`) validated: direct host is IPv6-only and unreachable from EC2; pooler `aws-0-ap-northeast-1.pooler.supabase.com` works. Tenant schema v2 applied (31 tables incl `schema_migrations`), reapply idempotent, backend `testTenantDsn` returns ok. Backend `ad84103` fixes `pg` overriding explicit TLS options; local suite 169 unit, 109 route, 136 static, 22 regression; deployed and healthy.
- [2026-11-17] Backend `71c1e0d` deployed to EC2 as `anime-backend:71c1e0d`; `/health` 200, n8n reaches `http://backend:3000`, test-account login/projects/prompt-meta pass, hybrid routes return 401 unauthenticated. At that deployment, migration `011` was still unapplied and BYOD was off; both were completed later on 2026-11-17.
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
- BYOD IS LIVE FOR THE TEST ACCOUNT ONLY: central migration `011` is applied, runtime BYOD is enabled, and the test tenant passes connect/health/provision/cutover/rollback. Broad rollout remains gated by all 14 workflows, pause/rotation/restore drills, cross-tenant denial, and BYOD-first project creation (new projects still write to central before migration). Direct Supabase DB hosts are IPv6-only; use the project pooler DSN from EC2.
- TRUE S3/CUSTOM STORAGE REMAINS PARTIAL: adapters/routes exist, but generation media still relies on Telegram/custom URLs.
- GitHub worker token is stored but not fully used by worker/workflows.
- Phase 4 cutover copies all 30 project tables with idempotent upserts and per-table row-count verification; live cutover/rollback passed on one smoke project. Cryptographic checksums are still not implemented, so broad cutover remains gated.
- Android cannot be built or run locally on this Termux host (no adb/emulator, memory constrained); verify only through GitHub Actions.
- Recreating `ai-backend` requires `--network ec2-user_default --network-alias backend` because n8n calls `http://backend:3000`.
- Do not use live `naagraj ek warrior` (`db2b78b3-d391-487b-81b2-83217216754e`) for destructive fixtures.
- Production DB password was previously exposed in chat; rotate via the Supabase dashboard (pooler role cannot alter the password), then update EC2 env.

## Pending / Next Steps
1. Validate all 14 workflows against the live BYOD test tenant, including gateway writes, system fan-out, `pending_actions` exclusion, and callback paths.
2. Implement BYOD-first project creation/list routing; currently `createProjectSynchronous` writes central and `listProjects` reads central, so a connected BYOD user still needs an explicit migration for new projects.
3. Run live cross-tenant denial, pause/unpause, DSN rotation, DB-down fail-closed, restore, and 7-day rollback drills; confirm no central fallback for paused/DB-down BYOD.
4. Finish Phase 6 per-project migration retry and audited runtime feature toggles.
5. Rotate the exposed production/BYOD DB passwords and configure worker/Telegram credentials for a real generation smoke.
