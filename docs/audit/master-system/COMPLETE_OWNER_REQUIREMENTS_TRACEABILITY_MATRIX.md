# Complete Owner Requirements Traceability Matrix

Date: 2026-11-09
Status: **COMPLETE PLANNING TRACEABILITY — IMPLEMENTATION NOT AUTHORIZED**
Scope: Every approved Owner requirement and non-negotiable constraint identified in the decision register, implementation handoff, Prompt Studio audit, master reports, and current source review.

## 1. How to Read This Matrix

Status values describe the **current implementation and evidence state**, not whether the requirement is approved:

| Status | Meaning |
|---|---|
| `PASS` | Current evidence satisfies the requirement for the stated scope |
| `PARTIAL` | Some implementation or evidence exists; acceptance condition is not met |
| `NOT IMPLEMENTED` | No sufficient implementation exists |
| `BLOCKED` | Cannot be completed or verified without a missing environment, credential, decision, or authorization |
| `NOT TESTED` | Implementation may exist, but the required test was not executed |

Decision values:

- `APPROVED` — recorded in `OWNER_DECISION_REGISTER.md`.
- `CONSTRAINT` — non-negotiable rule in the handoff or AGENTS.md.
- `OPEN` — OD-14 only.

Batch values refer to the revised `MASTER_EXECUTION_ROADMAP.md`.

## 2. Governance and Non-Negotiable Constraints

| ID | Requirement | Source | Decision | Current implementation evidence | Current test evidence | Status | Batch |
|---|---|---|---|---|---|---|---|
| GOV-01 | Build the complete approved system, not a partial product release | OD-01, OD-04, handoff §3 | APPROVED | Full system not built | Component tests only | NOT IMPLEMENTED | 1–4 |
| GOV-02 | Preserve exactly 14 canonical workflows WF-00–WF-13 | OD-06, handoff §3 | APPROVED | 14 canonical JSON files present | 14/14 static validation | PASS | 1–4 |
| GOV-03 | Backend is sole authorized intermediary for n8n/database operations | OD-06 | APPROVED | Boundary exists in routes/adapters; direct DB paths remain | Route tests partial | PARTIAL | 1–4 |
| GOV-04 | Normal Chat AI bypasses n8n and streams directly from backend to provider | OD-06, OD-16 | APPROVED | Direct AI route exists; project fallback risk remains | Provider runtime not tested | PARTIAL | 2–3 |
| GOV-05 | Do not expose secrets in source, logs, reports, screenshots, or commits | Handoff §3, AGENTS.md | CONSTRAINT | No literal production secret found in current scan | Static credential scan | PASS | 1–4 |
| GOV-06 | Do not contact or modify production under planning/implementation until OD-15 go-ahead | OD-15, handoff §3 | APPROVED | No production action performed | Safety review | PASS | 1–4 |
| GOV-07 | Do not create WF-14 or rename/re-scope canonical workflows without approval | OD-06, handoff §3 | CONSTRAINT | No WF-14 exists | 14/14 static validation | PASS | 1–4 |
| GOV-08 | Preserve existing user data and functionality | OD-07, handoff §3 | APPROVED | No migration executed | Preservation not tested | NOT TESTED | 4 |
| GOV-09 | Do not start Stage 5 while OD-14 is open | OD-14 | OPEN | Stage 5 not started | Decision review | PASS | 4 |
| GOV-10 | Production deployment requires separate explicit OD-15 go-ahead | OD-15 | APPROVED | No production deployment | Safety review | PASS | 4 |

## 3. Authentication, Identity, and Session Security

| ID | Requirement | Source | Decision | Current implementation evidence | Current test evidence | Status | Batch |
|---|---|---|---|---|---|---|---|
| AUTH-01 | Supabase Auth as primary authentication | OD-03 | APPROVED | Login still returns `503 AUTH_NOT_CONFIGURED` | No clean-install login | NOT IMPLEMENTED | 1 |
| AUTH-02 | Backend verifies Supabase-issued JWTs | OD-03, handoff §7.1 | APPROVED | HS256 shared-secret verification; no Supabase JWKS flow | JWT route tests pass for current verifier | PARTIAL | 1 |
| AUTH-03 | Server-side user/tenant/project/resource ownership | OD-03, OD-07 | APPROVED | Project guard works; `getProject` ignores user; list fallback remains | Cross-user/spoof tests pass for guarded routes | PARTIAL | 1 |
| AUTH-04 | Refresh rotation, expiry, logout, revocation | OD-03 | APPROVED | No Supabase session/refresh/revocation flow | Not tested | NOT IMPLEMENTED | 1 |
| AUTH-05 | Android tokens in Keystore-backed storage | OD-11 | APPROVED | Plaintext `SharedPreferences` | No Keystore test | NOT IMPLEMENTED | 4 |
| AUTH-06 | Android backup excludes sensitive tokens | OD-11 | APPROVED | `allowBackup="true"` | No backup exclusion test | NOT IMPLEMENTED | 4 |
| AUTH-07 | No provider or database secrets stored on Android | OD-11, OD-08 | APPROVED | No provider secret storage found in inspected app paths | Static review | PASS | 4 |
| AUTH-08 | Service identities cannot act as users or Owner | OD-03, OD-08 | APPROVED | Trusted-service separation exists; service-role breadth remains | Route tests pass for current scope | PARTIAL | 1 |
| AUTH-09 | Signed, short-lived, job-scoped worker authorization | OD-09 | APPROVED | Worker endpoints unauthenticated | No positive/negative worker auth tests | NOT IMPLEMENTED | 3 |
| AUTH-10 | Worker callbacks signed and bound to job/project/tenant | OD-09, P0-2 | APPROVED | Inbound n8n HMAC exists; worker callback binding incomplete | HMAC/replay unit tests pass | PARTIAL | 3 |

## 4. Database Ownership, Migration, and Key Lifecycle

| ID | Requirement | Source | Decision | Current implementation evidence | Current test evidence | Status | Batch |
|---|---|---|---|---|---|---|---|
| DB-01 | User-owned database is source of truth for user content | OD-07 | APPROVED | BYOD routing not implemented | No isolation test | NOT IMPLEMENTED | 4 |
| DB-02 | Platform database keeps only control/audit metadata | OD-07 | APPROVED | Platform/anime clients separated; content still platform-side | No migration verification | PARTIAL | 4 |
| DB-03 | Split `projects` into platform registry and tenant content | OD-07 | APPROVED | No split migration | Not tested | NOT IMPLEMENTED | 4 |
| DB-04 | Decide and enforce `documents` ownership | OD-07 | APPROVED | No ownership implementation | Not tested | NOT IMPLEMENTED | 4 |
| DB-05 | Do not blindly split, move, or delete existing rows | OD-07, OD-10 | CONSTRAINT | No data movement performed | Safety review | PASS | 4 |
| DB-06 | Version-controlled, repeatable migrations with history | OD-10 | APPROVED | Migration drift exists; `001_full_schema.sql` incomplete | Static contract only | PARTIAL | 1 |
| DB-07 | Validate migrations in isolated environment | OD-10, OD-13 | APPROVED | No isolated test database | 4 DB tests skipped | BLOCKED | 1–4 |
| DB-08 | Named rollback authority and tested rollback plan | OD-10 | APPROVED | No tested rollback | Not tested | PARTIAL | 4 |
| DB-09 | Versioned encryption key registry and rotation | OD-12A | APPROVED | Single versionless key | No rotation test | NOT IMPLEMENTED | 4 |
| DB-10 | Root key outside database; KMS-ready hybrid custody | OD-12B | APPROVED | Environment key only; no registry | Not tested | NOT IMPLEMENTED | 4 |
| DB-11 | No service-role default for BYOD; least-privilege credentials | OD-08 | APPROVED | Backend/worker templates use service-role patterns | Static findings only | NOT IMPLEMENTED | 4 |

## 5. Prompt Studio and Master Prompt Library

| ID | Requirement | Source | Decision | Current implementation evidence | Current test evidence | Status | Batch |
|---|---|---|---|---|---|---|---|
| PROMPT-01 | Persist `prompt_category` on create/update/read | Handoff §19, Prompt audit | APPROVED | `CreatePromptBody` and insert omit category | UI tests only; persistence fails | NOT IMPLEMENTED | 2 |
| PROMPT-02 | Create, edit, update, save, delete prompts | Handoff §19 | APPROVED | Create/delete exist; no update route | Route tests partial | PARTIAL | 2 |
| PROMPT-03 | Saving a prompt must not mutate project medium/default | Handoff §19 | APPROVED | `set_active` updates project medium/default | Defect confirmed by source | NOT IMPLEMENTED | 2 |
| PROMPT-04 | Prompt reads and injection isolated by user/project/tenant | Handoff §19 | APPROVED | Pre-validation lacks user filter; active lookup lacks user filter | No isolation test | NOT IMPLEMENTED | 2 |
| PROMPT-05 | Search and filters | Handoff §19 | APPROVED | No source surface | Not tested | NOT IMPLEMENTED | 2 |
| PROMPT-06 | Favorites | Handoff §19 | APPROVED | No source surface | Not tested | NOT IMPLEMENTED | 2 |
| PROMPT-07 | Versioning/history | Handoff §19 | APPROVED | No working version table/route | Not tested | NOT IMPLEMENTED | 2 |
| PROMPT-08 | Prebuilt genre templates including Horror, Thriller, Romance, Comedy, Action, Mythology | Handoff §19 | APPROVED | No template registry | Not tested | NOT IMPLEMENTED | 2 |
| PROMPT-09 | Formats: Anime, Realistic Human, Live-action, Cinematic; extensible | Handoff §19 | APPROVED | ANIME/REAL_HUMAN only; other formats collapse | UI tests only | PARTIAL | 2 |
| PROMPT-10 | Multi-select prompts at project creation | Handoff §19 | APPROVED | No project-creation prompt selector | Not tested | NOT IMPLEMENTED | 2 |
| PROMPT-11 | Auto-associate selected prompts with Story Bible | Handoff §19 | APPROVED | BIBLE prompt injection exists; selection incomplete | Static only | PARTIAL | 2 |
| PROMPT-12 | Episode overrides without corrupting project defaults | Handoff §19 | APPROVED | Episode override path exists; restore/persistence incomplete | UI only | PARTIAL | 2 |
| PROMPT-13 | IMAGE prompts reach image generation | Handoff §19 | APPROVED | Category matching partial; WF-03 ignores custom prompt | Not tested | PARTIAL | 2 |
| PROMPT-14 | Episode dispatch reaches WF-03 | Handoff §19 | APPROVED | WF-02 builds payload only | Static confirmation | NOT IMPLEMENTED | 2 |
| PROMPT-15 | Shared library reachable from project creation, Story Bible, episode production, Prompt Studio | Handoff §19 | APPROVED | Prompt Studio and episode partial; creation/Bible missing | UI only | PARTIAL | 2 |
| PROMPT-16 | Prompt compatibility validation | Handoff §19 | APPROVED | No genre/style/medium compatibility checks | Not tested | NOT IMPLEMENTED | 2 |
| PROMPT-17 | Organize custom prompts and reusable library | Handoff §19 | APPROVED | Basic project-scoped list only | UI only | PARTIAL | 2 |

## 6. Providers, Models, and Universal Fallback

| ID | Requirement | Source | Decision | Current implementation evidence | Current test evidence | Status | Batch |
|---|---|---|---|---|---|---|---|
| PROV-01 | Support Groq, Gemini, NVIDIA NIM, compatible APIs | OD-16A | APPROVED | Groq/Gemini config exists; NVIDIA/compatible not proven | Provider runtime not tested | PARTIAL | 3 |
| PROV-02 | Primary + optional secondary provider, priority, model selection | OD-16A | APPROVED | Partial model config; no full priority/fallback UI | Not tested | PARTIAL | 3 |
| PROV-03 | GPU providers: Kaggle, Colab, Lightning AI, paid/custom | OD-16B | APPROVED | Kaggle/custom config code only | No GPU runtime | NOT IMPLEMENTED | 3 |
| PROV-04 | CPU workers: GitHub Actions, VPS, custom | OD-16C | APPROVED | CPU worker exists; multi-provider registry partial | Contract tests only | PARTIAL | 3 |
| PROV-05 | Multiple storage providers with tenant-owned credentials | OD-16D | APPROVED | Telegram proxy plus partial infrastructure config | Mocked proxy only | PARTIAL | 3 |
| PROV-06 | Primary + optional secondary database with replication checks | OD-16E | APPROVED | No secondary DB/replication checks | Not tested | NOT IMPLEMENTED | 4 |
| PROV-07 | Primary-only configuration works | OD-16F | APPROVED | Existing single-provider path unverified end to end | No runtime E2E | NOT TESTED | 3 |
| PROV-08 | Manual and automatic fallback with configurable priority | OD-16F | APPROVED | No universal fallback engine | Not tested | NOT IMPLEMENTED | 3 |
| PROV-09 | No silent paid fallback; explicit permission required | OD-16F | APPROVED | No paid-fallback guard proven | Not tested | PARTIAL | 3 |
| PROV-10 | Preserve job state; checkpoint and resume | OD-16F | APPROVED | No checkpoint/resume implementation | Not tested | NOT IMPLEMENTED | 3 |
| PROV-11 | Auto, Simple, Advanced model selection modes | OD-16G | APPROVED | No mode implementation | Not tested | NOT IMPLEMENTED | 3 |
| PROV-12 | Task-specific models for image, video, animation, lip-sync, voice | OD-16G | APPROVED | Static workflow/model references only | Not tested | NOT IMPLEMENTED | 3 |
| PROV-13 | Filter models by GPU, VRAM, dependencies, weights | OD-16G | APPROVED | No compatibility filter | Not tested | NOT IMPLEMENTED | 3 |
| PROV-14 | Verify replication lag/consistency; never blind failover | OD-16E | APPROVED | No replication/failover logic | Not tested | NOT IMPLEMENTED | 4 |

## 7. BYOI, Platform-Managed, and Owner Controls

| ID | Requirement | Source | Decision | Current implementation evidence | Current test evidence | Status | Batch |
|---|---|---|---|---|---|---|---|
| INFRA-01 | Full BYOI mode for user-owned infrastructure/providers | OD-05 | APPROVED | Infrastructure config exists; onboarding/routing absent | Auth/encryption route tests only | PARTIAL | 4 |
| INFRA-02 | Platform-Managed implemented but disabled and “Coming Soon” | OD-05 | APPROVED | No full pool/billing/mode control | Not tested | PARTIAL | 4 |
| INFRA-03 | GPU and CPU choices independent in both modes | OD-05, OD-16 | APPROVED | Partial config fields; no full matrix | Not tested | PARTIAL | 4 |
| INFRA-04 | Per-minute metering, billing, queueing, capacity, usage limits | OD-05 | APPROVED | No full metering/billing engine | Not tested | NOT IMPLEMENTED | 4 |
| INFRA-05 | Secure Owner Admin Dashboard for provider/infrastructure/modes/approvals | OD-05, handoff §11.3 | APPROVED | Owner routes/screens partial/static | UI tests only | PARTIAL | 4 |
| INFRA-06 | Queue, concurrency, capacity controls | OD-05, OD-16 | APPROVED | Admin queue surface exists; runtime controls unverified | UI/route only | PARTIAL | 4 |
| INFRA-07 | Tenant isolation for jobs, files, data, secrets | OD-05, OD-07 | APPROVED | Project guard partial; no BYOD tenant resolver | No tenant isolation test | PARTIAL | 4 |
| INFRA-08 | No hidden shared infrastructure or hardcoded Owner resources | OD-05 | CONSTRAINT | Platform token/default patterns remain | Static findings | NOT IMPLEMENTED | 4 |

## 8. Memory, Low-TPM, and Token Efficiency

| ID | Requirement | Source | Decision | Current implementation evidence | Current test evidence | Status | Batch |
|---|---|---|---|---|---|---|---|
| MEM-01 | Real story-memory retrieval; replace random embeddings | Handoff §13 | APPROVED | `memory.service.ts` generates random embeddings | No semantic retrieval test | NOT IMPLEMENTED | 2 |
| MEM-02 | Retrieve relevant Chat memory instead of full history | Handoff §14 | APPROVED | Local 60-message cache only | UI tests only | PARTIAL | 2 |
| MEM-03 | Separate user, project, story, and chat memory scopes | Handoff §§13–14 | APPROVED | Partial project scope; no full separation | Not tested | PARTIAL | 2 |
| MEM-04 | Deduplicate, correct, and supersede stale/conflicting facts | Handoff §§13–14 | APPROVED | No correction/dedup workflow | Not tested | NOT IMPLEMENTED | 2 |
| MEM-05 | Clear/delete memory and enforce retention/privacy | Handoff §§13–14 | APPROVED | No complete delete/retention path | Not tested | PARTIAL | 2 |
| MEM-06 | Low-TPM budgets, rate limits, backoff, fallback, no retry storms | Handoff §12 | APPROVED | Partial model limits; no full low-TPM engine | Not tested | PARTIAL | 3 |

## 9. Android Completion

| ID | Requirement | Source | Decision | Current implementation evidence | Current test evidence | Status | Batch |
|---|---|---|---|---|---|---|---|
| AND-01 | Draggable floating chat bubble across applicable screens | Handoff §15 | APPROVED | Fixed FAB; no draggable bubble | No drag test | NOT IMPLEMENTED | 4 |
| AND-02 | Position persistence, edge snapping, safe areas/insets | Handoff §15 | APPROVED | Offset persistence helpers exist; not integrated | No test | PARTIAL | 4 |
| AND-03 | Accessible, non-interfering bubble behavior | Handoff §15 | APPROVED | No bubble semantics/traversal tests | Not tested | NOT IMPLEMENTED | 4 |
| AND-04 | Complete Owner screens and Platform-Managed “Coming Soon” behavior | OD-05, handoff §8.4 | APPROVED | Owner screens exist; live controls partial | UI tests only | PARTIAL | 4 |
| AND-05 | Build complete APK | OD-01, OD-04 | APPROVED | Debug APK/test APK built in CI | CI `42577400016` | PASS | 4 |
| AND-06 | Manual accessibility: TalkBack, Switch Access, scaling, contrast, RTL, focus, touch targets | Handoff §16 | APPROVED | Automated 5/5 only | Manual not performed | NOT TESTED | 4 |
| AND-07 | Physical-device/tablet acceptance | OD-01, handoff §16 | APPROVED | No device | Not performed | NOT TESTED | 4 |

## 10. Workflow Reliability and Callback Path

| ID | Requirement | Source | Decision | Current implementation evidence | Current test evidence | Status | Batch |
|---|---|---|---|---|---|---|---|
| N8N-01 | Preserve the 14 canonical workflow IDs and responsibilities | OD-06 | CONSTRAINT | 14/14 unique IDs | Static validation | PASS | 1–4 |
| N8N-02 | Callback, error, retry, and terminal-state handling in existing workflows | P0-3, handoff §10 | APPROVED | No callback/error nodes | Static confirmation | NOT IMPLEMENTED | 1 |
| N8N-03 | WF-02 invokes WF-03 for visual production | Handoff §19 | APPROVED | WF-02 builds payload only | Static confirmation | NOT IMPLEMENTED | 2 |
| N8N-04 | Canonical workflow IDs and environment preflight resolve | Handoff §10 | APPROVED | Canonical IDs unique; env preflight mismatch risk | Static only | PARTIAL | 2 |
| N8N-05 | No WF-14 and no unauthorized workflow promotion | OD-06 | CONSTRAINT | No WF-14 | Static validation | PASS | 1–4 |
| N8N-06 | Execute all 14 workflows in isolated runtime | OD-13, handoff §16 | APPROVED | No disposable n8n | Not executed | BLOCKED | 4 |

## 11. Verification, AWS, and Acceptance

| ID | Requirement | Source | Decision | Current implementation evidence | Current test evidence | Status | Batch |
|---|---|---|---|---|---|---|---|
| TEST-01 | Use only PASS, FAIL, BLOCKED, NOT TESTED for test claims | Handoff §16.3 | CONSTRAINT | Reports follow convention | Documentation review | PASS | 1–4 |
| TEST-02 | Do not present mocks/static/UI tests as runtime evidence | Handoff §16.3 | CONSTRAINT | Reports state limitations | Documentation review | PASS | 1–4 |
| TEST-03 | Isolated disposable DB, n8n, workers, Telegram, and credentials | OD-13 | APPROVED | No isolated environment | Not available | BLOCKED | 1–4 |
| TEST-04 | Run database integration tests | OD-13 | APPROVED | 4 tests skipped | No test DB | BLOCKED | 1 |
| TEST-05 | Run n8n runtime, callbacks, and all 14 workflows | OD-13 | APPROVED | No n8n runtime | Not executed | BLOCKED | 4 |
| TEST-06 | Run CPU TTS/FFmpeg and GPU media runtime | OD-13, OD-16 | APPROVED | Contract tests only | No runtime | NOT TESTED | 3 |
| TEST-07 | Run full Android → backend → DB → n8n → worker → storage → playback E2E | OD-01, OD-13 | APPROVED | No environment | Not executed | BLOCKED | 4 |
| TEST-08 | Recover and verify existing AWS runtime; do not recreate it | Owner instruction | CONSTRAINT | No AWS access/logs | Not inspected | BLOCKED | 1, 4 |
| TEST-09 | Owner practical testing of complete system | OD-01, OD-04 | APPROVED | No complete system | Not performed | NOT TESTED | 4 |
| TEST-10 | Explicit Owner acceptance before closure/release | OD-01, OD-04 | APPROVED | No acceptance record | Not recorded | BLOCKED | 4 |
| TEST-11 | Do not weaken or delete assertions to obtain a pass | Handoff §16.3 | CONSTRAINT | No assertion weakening observed | Review | PASS | 1–4 |
| TEST-12 | Preserve historical 19/16 baselines; do not rewrite history | OD-02 | APPROVED | Historical records preserved | Review | PASS | 1–4 |

## 12. Matrix Summary

| Status | Count |
|---|---:|
| PASS | 15 |
| PARTIAL | 34 |
| NOT IMPLEMENTED | 38 |
| BLOCKED | 8 |
| NOT TESTED | 6 |
| **Total requirements mapped** | **101** |

Counts include governance constraints and verification requirements. `PASS` means the requirement is satisfied only for the scope stated in the row; it does not imply full-system readiness.

## 13. Critical Requirement Chains

These chains must be completed in order. A later chain cannot be accepted while an earlier dependency is blocked.

1. **Identity chain:** Supabase Auth → backend JWT verification → server ownership → Android Keystore → session revocation.
2. **Data chain:** isolated database → migrations → ownership enforcement → schema alignment → database integration tests.
3. **Prompt chain:** category schema → create/update/versioning → tenant isolation → genre/style templates → Story Bible/episode wiring → IMAGE/WF-03 dispatch.
4. **Workflow chain:** frozen 14 workflows → callback/error nodes → WF-02 → WF-03 → n8n runtime → terminal states.
5. **Worker chain:** signed job token → worker verification → callback binding → TTS/FFmpeg runtime → GPU runtime.
6. **Provider chain:** primary-only → secondary/priority → manual/automatic fallback → no silent paid fallback → checkpoint/resume → compatibility filtering.
7. **BYOI chain:** tenant resolver → registry/contracts → onboarding/binding → credential isolation → migration/shadow/rollback → tenant isolation tests.
8. **Acceptance chain:** complete implementation → APK → Owner practical testing → defect correction → explicit acceptance → OD-14 decision → OD-15 production approval.

## 14. Traceability Decision

- All approved Owner requirements are mapped.
- The matrix does not authorize implementation.
- The matrix does not claim any blocked or unexecuted test as PASS.
- Full-system readiness is not achieved.
- The revised roadmap must follow the critical chains and batch gates.

## 15. Safety Statement

- No implementation, migration, workflow change, credential rotation, AWS action, or production access occurred.
- No secret was reproduced.
- No stage was marked complete.
