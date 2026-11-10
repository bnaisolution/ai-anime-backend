# Batch 4 Final Owner Report

Date: 2026-11-10
Branch: `opencode/batch-4-byd-security`
Head: `7ef3016f995b5859c230de0d6b99a63740025f56`
Android head: `c39a5d5ad65b34e32ed729b5afdc80f3fa365626`
PR: `https://github.com/bnaisolution/ai-anime-backend/pull/4`
Android PR: `https://github.com/bnaisolution/ai-anime-android/pull/4`
Verdict: **SAFE BATCH 4 IMPLEMENTATION COMPLETE — RUNTIME, EXTERNAL, AND OWNER GATES REMAIN BLOCKED**

## 1. Executive Verdict

Batch 4 recovered the complete `B4-01`..`B4-20` scope from the master roadmap and implemented every safe item that did not require BYOD authorization, an isolated multi-tenant database, AWS access, a disposable n8n instance, paid providers, or a physical Android device.

The completed work includes provider-payload at-rest hardening, a tenant registry/resolver with fail-closed project enforcement, an additive tenant/project/documents migration, BYOI encryption versioning plus rotate/revoke/bind/validate lifecycle routes, disabled-by-default Platform-Managed interfaces, independent GPU/CPU/audio/LLM compute selection, an interface-only replication/failover adapter, Owner Batch 4 APIs, quota enforcement/audit, and Android draggable-assistant and Owner Overview controls.

Backend CI `42769809823` and Android CI `42772706167` are green. Android CI includes 58 JVM tests, 122 Compose instrumentation tests, lint, and 2/2 Maestro emulator flows. Maestro evidence is recorded in section 16.

No PR was merged. No production database, n8n workflow, credential, Android device, worker runtime, AWS resource, or paid workload was touched.

## 2. Scope and Authority

Authorized repositories:

- `bnaisolution/ai-anime-backend`
- `bnaisolution/ai-anime-android`
- `bnaisolution/anime-cpu-worker`

Completed:

- Recovered Batch 4 scope from the master roadmap and prior batch reports.
- Audited the command/outbox/callback provider-config lifecycle.
- Implemented backend provider-payload at-rest redaction and dispatch-time hydration.
- Added migration, rollback, TTL cleanup, unit tests, static tests, and CI.
- Implemented tenant registry/resolver, tenant APIs, project tenant enforcement, and additive tenant/project/documents ownership migration.
- Implemented BYOI lifecycle: encryption versioning, previous-key fallback, rotate, revoke, bind, validate, and lifecycle status.
- Implemented disabled-by-default Platform-Managed status, compute selection, replication interface/mock failover, Owner Batch 4 APIs, and quota guard/audit.
- Implemented Android draggable bounded assistant FAB with persisted offset and JVM coverage.
- Implemented Android Owner Overview Platform-Managed, replication, and quota states with API/repository hooks.
- Recorded all unavailable gates as `BLOCKED`, `PARTIAL`, `NOT RUN`, or `OWNER DECISION REQUIRED`.

Not performed:

- No production/isolated database migration execution or RLS/cross-tenant replay.
- No real Platform-Managed pool, provider billing, metering, or paid capacity.
- No real secondary database, replication, or failover execution.
- No live n8n import, activation, execution, or workflow modification.
- No worker runtime or worker authentication change.
- No physical-device backup, manual accessibility, or manual gesture testing.
- No AWS recovery action.
- No production deployment, credential rotation, release, or PR merge.
- No AI Assistant App, AI App Factory, or Super App change.
- No force-push, reset hard, branch deletion, or destructive Git operation.

## 3. Constraints and Safety

- Exactly 14 canonical workflows remain `WF-00`..`WF-13`; no `WF-14` was created.
- No production secrets were read, printed, logged, or committed.
- Database work is static/migration-only; no database connection was opened.
- n8n work is static/contract-only; no live instance was used.
- Android SDK/Gradle/emulator work was not run locally on Termux.
- Existing Batch 2 and Batch 3 branches/PRs remain intact and unmerged.
- Production-code changes are limited to backend Batch 4 security/tenant/platform controls and Android Batch 4 owner/FAB controls; no production runtime was exercised.

## 4. Repositories, Branches, PRs, and Commits

| Repository | Local path | Batch 4 branch | Base | Head | PR |
|---|---|---|---|---|---|
| Backend | `/data/data/com.termux/files/home/anime-audit/ai-anime-backend` | `opencode/batch-4-byd-security` | `opencode/batch-3-test-framework` | `7ef3016f995b5859c230de0d6b99a63740025f56` | `#4` OPEN, `CLEAN` |
| Android | `/data/data/com.termux/files/home/anime-audit/ai-anime-android` | `opencode/batch-4-owner-controls` | `opencode/batch-3-test-framework` | `c39a5d5ad65b34e32ed729b5afdc80f3fa365626` | `#4` OPEN, `CLEAN` |
| Worker | `/data/data/com.termux/files/home/anime-audit/anime-cpu-worker` | No Batch 4 branch | `opencode/batch-3-test-framework` | `c3a0435e92ae53fc8d47a382662f4040e903b93b` | `#1` OPEN, `CLEAN` |

Batch 2 remains unmerged:

- Backend PR #2: OPEN, `CLEAN`, head `935b2dc3c61c934240f18bf5cbf7cd193e4653f2`, base `opencode/batch-1-foundation`.
- Android PR #2: OPEN, `CLEAN`, head `e26890d6e406206eda07552ca906e4ba8718a1ec`, base `opencode/batch-1-foundation`.

Batch 4 commits:

- Backend `00d6e03` `feat(security): redact provider payloads at rest` (preserved).
- Backend `7ef3016` `feat: implement batch 4 tenant and platform controls`.
- Android `1fe7b7e` `feat: implement batch 4 owner and draggable assistant controls`.
- Android `c39a5d5` `fix(android): preserve owner and assistant accessibility controls`.

## 5. Batch 4 Scope Recovery

The roadmap section 9 work items are:

`B4-01` tenant resolver, `B4-02` BYOI lifecycle, `B4-03` projects/documents migration, `B4-04` Platform-Managed mode, `B4-05` GPU/CPU selection, `B4-06` Owner dashboard, `B4-07` secondary DB/replication, `B4-08` Android Keystore/backup, `B4-09` draggable chat bubble, `B4-10` Owner Android screens, `B4-11` encryption versioning/rotation, `B4-12` quota/audit/owner gating, `B4-13` AWS runtime verification, `B4-14` all 14 workflows in isolated n8n, `B4-15` full isolated E2E, `B4-16` manual accessibility/device/APK, `B4-17` full regression, `B4-18` Owner acceptance, `B4-19` OD-14 Stage 5 decision, `B4-20` OD-15 production approval.

The roadmap status table is stale for `B4-08`: the Android source already uses Keystore-backed encrypted preferences and `android:allowBackup="false"`. It remains unverified on a physical device/backup path.

## 6. Work-Item Matrix

| ID | Status | Evidence / reason |
|---|---|---|
| B4-01 | IMPLEMENTED / RUNTIME VERIFICATION BLOCKED | Tenant registry, resolver, routes, membership checks, project guard, and additive migration exist. No isolated DB replay/RLS/cross-tenant test. |
| B4-02 | IMPLEMENTED / RUNTIME VERIFICATION BLOCKED | BYOI bind/rotate/revoke/validate/lifecycle routes, versioned encryption, previous-key fallback, and public DTO exist. No isolated DB execution. |
| B4-03 | IMPLEMENTED MIGRATION / REPLAY BLOCKED | Additive `005` migration adds tenant/project ownership and BYOI metadata with rollback. No production/isolated replay. |
| B4-04 | SAFE INTERFACE / OWNER AUTHORIZATION BLOCKED | Disabled-by-default Platform-Managed status and owner activation API exist; no real pool, billing, metering, or paid capacity. |
| B4-05 | IMPLEMENTED / RUNTIME VERIFICATION BLOCKED | Independent GPU/CPU/audio/LLM compute selector with fallback and fail-closed behavior; no live worker/provider execution. |
| B4-06 | IMPLEMENTED SAFE SURFACE / RUNTIME BLOCKED | Owner Batch 4 APIs and Android Platform-Managed/replication/quota cards exist; full provider/model/approval control matrix remains future work. |
| B4-07 | INTERFACE ONLY / BLOCKED | `NoneReplicationAdapter` and explicit mock failover exist; failover fails closed when unconfigured. No real secondary DB. |
| B4-08 | SOURCE COMPLETE / DEVICE EVIDENCE BLOCKED | `TokenManager.kt:261` uses `MasterKey` + `EncryptedSharedPreferences`; `AndroidManifest.xml:4` sets `allowBackup="false"`. No physical backup/migration test. |
| B4-09 | IMPLEMENTED / DEVICE EVIDENCE BLOCKED | Bounded draggable FAB, persisted offset, visibility rules, test tag, and `FabOffsetTest` JVM coverage exist. Android CI green; no manual gesture/accessibility session. |
| B4-10 | IMPLEMENTED / RUNTIME BLOCKED | Owner Overview dynamically renders Platform-Managed status, replication status, and quota; API/repository hooks and test tags exist. Android CI green. |
| B4-11 | IMPLEMENTED / ROTATION RUNTIME BLOCKED | `v2:` ciphertext prefix, legacy decrypt, previous-key fallback, rotation/revocation/binding lifecycle exist. No live key-rotation drill. |
| B4-12 | IMPLEMENTED / RUNTIME VERIFICATION BLOCKED | Tenant quota status/assert, command guard, owner-only APIs, and `QUOTA_DENIED` audit exist. No full GOV-01 runtime evidence. |
| B4-13 | BLOCKED | No AWS read-only access or approved verification environment. |
| B4-14 | BLOCKED | No isolated n8n runtime; workflows were parsed/validated statically only. |
| B4-15 | BLOCKED | No integrated Android → backend → DB → n8n → worker → storage environment. |
| B4-16 | PARTIAL / NOT RUN | Automated Android CI and APK evidence exist; manual accessibility/device/tablet testing was not performed. |
| B4-17 | PARTIAL | Backend safe/regression suites pass; fresh full cross-repo exit gate is blocked. |
| B4-18 | BLOCKED | Owner practical testing and explicit acceptance cannot occur without a complete system. |
| B4-19 | OPEN / OWNER DECISION | OD-14 Stage 5 scope decision is not recorded. |
| B4-20 | BLOCKED | No separate OD-15 production go-ahead. |

## 7. Provider Config At-Rest Security

Before this change:

- `commands.service.ts` merged decrypted infrastructure with request-body infrastructure into `user_infrastructure`.
- `enrichedPayload` and `outboxPayload` persisted that object in `api_commands.payload` and `outbox_events.payload`.
- API responses were redacted, but stored payloads still carried provider credentials for n8n delivery.

After this change:

- Provider credentials are never intentionally persisted in command/outbox payloads.
- Dispatch hydrates provider configuration from encrypted `user_infrastructure` rows at the last responsible moment.
- n8n still receives the same `user_infrastructure`, `gpu_routing`, and `telegram_storage` contract.
- Request-body `user_infrastructure` is intentionally no longer trusted as a persisted dispatch source. Clients must configure infrastructure through the encrypted infrastructure API.

## 8. Command Submission Changes

`src/modules/anime/commands/commands.service.ts`:

- Extracted recursive redaction to `src/security/payloadRedaction.ts`.
- Persists `redactSensitivePayload(enrichedPayload)` and `redactSensitivePayload(outboxPayload)`.
- Keeps idempotency hashing and response redaction behavior.
- Uses `getHydratedInfrastructureForUser()` for prompt/infrastructure resolution.
- Removes sensitive keys case-insensitively, including snake_case, kebab-case, and camelCase forms.

## 9. Outbox Dispatch Hydration

`src/modules/anime/outbox/outbox.dispatcher.ts`:

- Adds `hydrateDispatchPayload(payload)`.
- Loads encrypted provider rows by `payload.user_id`.
- Attaches `user_infrastructure`, `gpu_routing`, and `telegram_storage` to the outbound top-level payload and nested `payload`.
- Does not write hydrated secrets back to `outbox_events`.
- Redacts n8n response data before updating `api_commands.payload`.

## 10. Callback and n8n Response Redaction

`src/modules/anime/callbacks/callbacks.handler.ts`:

- Redacts callback payload before inserting `callback_inbox.raw_payload`.
- Redacts `callback_payload` before inserting the reconcile outbox event.
- Preserves project/command/callback identifiers and audit fields.

## 11. Database Migration

`supabase/migrations/004_batch4_payload_security.sql` adds:

- `public.redact_sensitive_payload(jsonb)` recursive redaction function.
- `public.redact_sensitive_payload_trigger()`.
- `BEFORE INSERT OR UPDATE OF payload` triggers on `api_commands` and `outbox_events`.
- One-time cleanup of existing sensitive keys.
- `public.redact_expired_payloads(integer)` TTL cleanup RPC.
- Service-role execute grant for the TTL RPC.

No columns were added, so the verified live `api_commands` column contract is unchanged.

## 12. Rollback and Irreversibility

`supabase/migrations/004_batch4_payload_security_rollback.sql` drops:

- Both redaction triggers.
- TTL cleanup function.
- Trigger function.
- Recursive redaction function.

Rollback cannot restore credentials already removed by the forward migration. This is intentional and documented in the migration.

## 13. TTL and Cleanup

- Default retention is 24 hours.
- Override with `ANIME_PAYLOAD_REDACTION_TTL_HOURS`.
- The dispatcher calls `redact_expired_payloads` on each tick and logs failures without blocking dispatch.
- The TTL path is defense-in-depth for legacy/unknown sensitive keys; new writes are redacted before persistence and by database trigger.

## 14. Batch 4 Tenant, Platform, and Owner Implementation

Backend:

- `005_batch4_tenant_platform.sql` and rollback add `anime_tenants`, `anime_tenant_members`, `anime_platform_settings`, additive `projects.tenant_id`, `documents.tenant_id/project_id`, `quota_usage.tenant_id`, and BYOI metadata (`key_version`, `bound_tenant_id`, `last_rotated_at`, `revoked_at`, `fingerprint`) with legacy backfill and service-role RLS policies.
- Tenant module (`tenant.types`, `tenant.repo`, `tenant.service`, `tenant.routes`) resolves active memberships fail-closed, validates `x-tenant-id`/body/query consistency, rejects client user override, and exposes `/v1/anime/tenants`, `/current`, and `/:id/default`.
- Project guard selects `id, user_id, tenant_id`, rejects tenant-header/project mismatch, enforces membership when a project has a tenant, and sets `request.anime.tenant_id`.
- Error codes added: `TENANT_FORBIDDEN`, `TENANT_REQUIRED`, `QUOTA_EXCEEDED`, `PLATFORM_MANAGED_DISABLED`, `REPLICATION_NOT_CONFIGURED`.
- BYOI lifecycle uses `v2:` ciphertext, legacy decrypt, `ANIME_ENCRYPTION_KEY_PREVIOUS` fallback, and `/rotate`, `/revoke`, `/bind`, `/lifecycle`, `/validate`.
- Platform-Managed is disabled unless both `ANIME_PLATFORM_MANAGED_ENABLED=true` and `ANIME_PLATFORM_MANAGED_OWNER_APPROVED=true`; routes expose status/actions.
- Compute selection is independent for GPU, CPU, audio, and LLM with fallback and fail-closed behavior.
- Replication is interface-only: unconfigured failover throws `REPLICATION_NOT_CONFIGURED`; mock failover returns `simulated: true` and performs no destructive SQL.
- Owner Batch 4 routes expose platform-managed status/activate, replication status/failover, quota, and tenants; they are owner-only and reject service identity.
- Quota guard enforces tenant quota on `POST /v1/anime/commands` and audits `QUOTA_DENIED`.

Android:

- `FabOffset.kt` implements bounded offset clamping and route visibility; the global FAB is draggable via `detectDragGestures`, persisted with `TokenManager.saveFabOffset`, and hidden on `ai_brain`/`studio`.
- Owner Overview fetches platform, replication, and owner quota status and renders `ENABLED` vs `COMING SOON`, replication state, and quota summary.
- New API/repository methods are test-safe defaults on `AnimeRepositoryApi` so existing fakes remain valid.
- `FabOffsetTest` covers bounds and visibility.

## 15. Backend Test Evidence

Local results:

| Suite | Result |
|---|---|
| `npm run build` | PASS |
| `npm run test:unit` | PASS — 92 |
| `npm run test:routes` | PASS — 81 |
| `npm run test:static` | PASS — 89 |
| `npm run test:regression` | PASS — 19 |
| `npm run test:db` | BLOCKED — 4 skipped without isolated DB |

New coverage:

- `test/unit/payload.redaction.test.js`
- `test/unit/commands.hydration.test.js` updated for redaction + dispatch hydration
- `test/static/payload.security.test.js`
- `test/unit/tenant.service.test.js`
- `test/unit/compute.selector.test.js`
- `test/unit/infrastructure.crypto.test.js`
- `test/unit/platform.replication.test.js`
- `test/static/batch4.tenant.platform.test.js`

## 16. CI Evidence

- Backend CI run `42765154897`: PASS on `00d6e037a2c9c333181537751ffb0c6b3b9c8769`.
- Report-only CI run `42765554847`: PASS on `ec10bf24a4d97836ddf5d4f68c7f6764d23cafdb`; tested code unchanged.
- Report-only CI run `42765739905`: PASS on `cb450127e987a6677a244de0f2e618bd145cdc98`.
- Backend implementation CI run `42769809823`: PASS on `7ef3016f995b5859c230de0d6b99a63740025f56`.
- Backend safe suites and regression jobs: PASS.
- Backend isolated database job: SKIPPED by the safety gate.
- Backend PR #4: OPEN, `CLEAN`, base `opencode/batch-3-test-framework`.

Android CI run `42772706167`: PASS on `c39a5d5ad65b34e32ed729b5afdc80f3fa365626`.

- JVM unit tests: PASS — 58 tests, 0 failures.
- Compose instrumentation: PASS — 122 tests on API 34 emulator.
- Android Lint: PASS (informational).
- Maestro smoke: PASS — 2/2 flows executed on `emulator-5554`:
  - `01-launch`: launch, visible `AI Cinematic Anime Studio`, visible `Sign In to Studio`.
  - `02-auth-validation`: tap `Sign In to Studio`, visible `Email and password are required.`
  - Artifact `android-maestro-artifacts` contains per-flow `commands.json`, `manifest.json`, screenshots, screen hierarchy, Maestro logs, and emulator logcat.
  - The only non-completed command is an intentional optional `tapOnElement("Wait")` marked `WARNED`; all required assertions are `COMPLETED`.
- Android test summary: PASS.

No new Batch 4 worker CI run was created because the worker was not changed.

## 17. Android Status

- Batch 4 Android CI `42772706167` is PASS on `c39a5d5`: 58 JVM, 122 instrumentation, lint, 2/2 Maestro emulator flows.
- `B4-08` source remains complete: Keystore-backed encrypted preferences and backup disabled.
- `B4-09` is implemented: bounded draggable FAB, persisted offset, route visibility, test tag, and JVM coverage. Manual gesture/snap/accessibility evidence remains `NOT RUN`.
- `B4-10` is implemented: Owner Overview renders dynamic Platform-Managed, replication, and quota states. Full provider/model/approval control matrix remains future work.
- Manual accessibility/device/tablet testing remains `NOT RUN`.

## 18. Worker Status

- Batch 3 worker evidence remains valid: `c3a0435`, CI `42757780077`, 20 tests.
- No Batch 4 worker code change was made.
- Worker endpoint authentication gap remains a separate security decision.
- No TTS/FFmpeg/GPU/Telegram runtime was executed.

## 19. n8n Status

- Canonical workflows remain exactly 14.
- Static contract validation passes.
- No workflow was imported, activated, executed, or modified.
- `n8n-workflows-all/` remains auxiliary.
- The existing all-`active: true` export state and WF-00 environment-ID references remain configuration review items.

## 20. Database Status

- No database connection was opened.
- `005_batch4_tenant_platform.sql` is additive and paired with rollback; static migration ordering and destructive-command checks pass.
- Migration replay, trigger execution, TTL RPC execution, RLS, and cross-tenant behavior remain `BLOCKED`.
- The payload migration is additive except for irreversible redaction of existing sensitive rows.

## 21. Security Findings

- Provider config no longer intentionally rests in command/outbox payloads.
- Redaction covers nested objects/arrays and common secret key forms.
- Database trigger is defense-in-depth against future regressions.
- n8n response and callback payloads are redacted before persistence.
- Residual risk: request-body provider config is ignored for dispatch; this is intentional but must be communicated.
- Residual risk: worker endpoint authentication is still unresolved.
- Residual risk: encryption key versioning/rotation is implemented but not exercised against a live key ring or KMS.
- Residual risk: tenant/platform/replication paths are implemented but not replayed against an isolated database or real provider.

## 22. Blocked Gates

| Gate | Status | Reason |
|---|---|---|
| BYOD/tenant resolver and isolation | BLOCKED | No authorization/isolated multi-tenant environment |
| Isolated DB migration/RLS/trigger replay | BLOCKED | No isolated Supabase project/secrets |
| Platform-Managed mode | SAFE INTERFACE ONLY | Disabled-by-default code exists; real providers/billing require Owner authorization |
| AWS runtime recovery | BLOCKED | No AWS read-only access |
| Live n8n 14-workflow runtime | BLOCKED | No disposable n8n instance |
| Worker runtime/auth verification | BLOCKED | No runtime services; auth decision pending |
| Manual Android accessibility/device | NOT RUN | No physical device/manual session |
| Full E2E and Owner acceptance | BLOCKED | No complete isolated system |
| OD-14/OD-15 decisions | OPEN/BLOCKED | Owner decisions not recorded |
| Real Platform-Managed capacity | BLOCKED | No provider/billing authorization or paid environment |
| Real replication/failover | BLOCKED | No isolated secondary database |

## 23. Owner Actions

1. Review the intentional behavior change: per-command `user_infrastructure` is no longer persisted or dispatched; configure provider credentials through the encrypted infrastructure API.
2. Approve or reject Batch 4 PR #4; it stacks on Batch 3, which stacks on Batch 2.
3. Provide an isolated Supabase project to execute migration/trigger/TTL/RLS replay.
4. Provide an isolated multi-tenant environment to replay `B4-01`..`B4-07` and validate RLS/cross-tenant behavior.
5. Provide a disposable n8n instance for `B4-14`.
6. Provide AWS read-only access or an approved verification environment for `B4-13`.
7. Schedule physical Android accessibility/device testing for `B4-16`.
8. Decide whether worker endpoint authentication and live key-rotation/KMS drills are separate follow-up batches.

## 24. Final PR Status

- Backend PR #4: `https://github.com/bnaisolution/ai-anime-backend/pull/4` — OPEN, `CLEAN`, base `opencode/batch-3-test-framework`, head `7ef3016f995b5859c230de0d6b99a63740025f56`.
- Android PR #4: `https://github.com/bnaisolution/ai-anime-android/pull/4` — OPEN, `CLEAN`, base `opencode/batch-3-test-framework`, head `c39a5d5ad65b34e32ed729b5afdc80f3fa365626`.
- Backend PR #3: OPEN, `CLEAN`, head `550f0ef526553f4ebc33c1ec6c6d4d88e42eb4fd`.
- Android PR #3: OPEN, `CLEAN`, head `7087f332e8639f4fff7ceb9e9504324d37264326`.
- Worker PR #1: OPEN, `CLEAN`, head `c3a0435e92ae53fc8d47a382662f4040e903b93b`.

## 25. Final Status

**Batch 4 provider-config at-rest security hardening: PASS.**
**Batch 4 safe tenant/platform/BYOI/owner implementation: PASS in CI.**
**Batch 4 isolated DB replay, real Platform-Managed capacity, real replication, AWS recovery, live n8n runtime, worker runtime, manual Android accessibility, full E2E, Owner acceptance, and production approval: BLOCKED / NOT RUN.**

No production system was touched, no database migration was executed, no workflow was activated, and no PR was merged.
