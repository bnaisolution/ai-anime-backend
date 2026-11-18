# BYOD SaaS + AI Director Gap Closure Master Plan

Date: 2026-11-18
Status: **WAVE 1 IMPLEMENTED & DEPLOYED — PHASES 4–9 PENDING OWNER GO-AHEAD**
Baseline: backend `origin/main` `9ee99e5`; Android `origin/main` `8cb4e2c`; live container `anime-backend:director-gap1-20261118`

## Implementation Status (2026-11-18)
| Phase | Status | Evidence |
|---|---|---|
| 0 Baseline/flags | DONE (partial) | `src/config/flags.ts`; backups in `/tmp/opencode/sync-backup-20261118` |
| 1 Capability registry | DONE | `director.capabilities.ts`, `GET /ai/director/capabilities`, unit tests |
| 2 Readiness + fail-closed | DONE (flag off by default) | `director.readiness.ts`, `GET /ai/director/readiness`, `SETUP_REQUIRED` |
| 3 Model catalog + profiles | DONE (backend) | `modelCatalog.ts`, migration 017, `GET /ai/models/catalog` |
| 4 Director UX | PARTIAL | Android readiness strip done; timeline/deep links/plan/attachments pending |
| 5 Publish OAuth | NOT STARTED | — |
| 6 CPU/Git/S3 wiring | NOT STARTED | — |
| 7 14-workflow BYOD validation | NOT STARTED | — |
| 8 SaaS billing/onboarding | NOT STARTED | — |
| 9 Observability/GA | NOT STARTED | — |

**Open blocker:** migrations 015–017 are not applied (no DB DSN on the host); Android APK `anime-debug-apk` from run `44378365016` is the build to test.
Scope: Backend (Fastify), Supabase, n8n (14 canonical workflows), Android, GPU/Kaggle/CPU workers, BYOD providers, publishing channels, SaaS control plane.

This document converts the 2026-11-18 audit findings into a dependency-ordered implementation plan. It does not authorize source, schema, workflow, credential, deployment, or production changes. Each phase starts only after explicit Owner approval.

---

## 0. Executive Summary

The AI Director and BYOD engine are substantially built, but the product is not yet a production-ready BYOD SaaS. The main gaps are:

1. No capability registry — every new Director action needs manual code changes in 4–5 places.
2. Director sees only AI provider + a weak GPU flag — not database, Telegram, YouTube, Git, CPU, storage, or model capability.
3. Production actions can silently fall back to platform resources instead of failing closed.
4. YouTube/Instagram "Connect" is a local UI toggle, not OAuth.
5. `cpu_worker` and `storage_choice` are saved but never consumed; GitHub token is stored but not used for dispatch.
6. 14 workflows are not validated on the BYOD data plane.
7. No billing, self-serve onboarding, or plan enforcement.
8. Image/video models are hardcoded; chat model lists are hardcoded in the Android app.

**Target outcome:** one BYOD-first SaaS control plane where a user can sign up, connect their own database, AI key, GPU/Kaggle, CPU/GitHub worker, Telegram/S3 storage, and YouTube/Instagram channel, then run story → video → QC → publish from the AI Director with server-verified approvals and fail-closed resource gates.

**Indicative effort:** 10 phases, ~12–14 weeks with one senior full-stack engineer plus parallel Android/n8n work. Android builds remain in GitHub Actions only.

---

## 1. Verified Baseline (2026-11-18)

| Area | Current state | Evidence | Status |
|---|---|---|---|
| AI Director backend | Chat, context, duration, actions, conversation, routes | `src/modules/ai/director/*`, migration 013 | READY |
| AI Director Android | Shared ViewModel, full screen + sheet, action cards, command polling | `AIDirectorViewModel.kt`, `AIBrainScreen.kt`, `4c772d8` | READY |
| Director action safety | HMAC token, 10-min TTL, context-version revalidation, idempotency | `director.actions.ts`, `director.service.ts` | READY |
| BYOD database | Tenant registry, connect/health/provision/migrate, BYOD-first projects | migration 011, `projects.service.ts`, flags enabled | PARTIAL — test account only |
| BYOD AI | Groq/Gemini/custom resolver, encrypted keys, quota | `providerResolver.ts`, `user_infrastructure` | READY |
| Kaggle / own GPU | 3-tier resolver, per-user sessions, worker token | `storywf03.json`, migration 012 | PARTIAL — worker health not proven |
| GitHub CPU | Worker URL used for TTS/FFmpeg; token stored | `storywf03.json` | PARTIAL — token unused |
| Standalone CPU | `cpu_worker` config saved | `infrastructure.routes.ts` | NOT WIRED |
| Telegram | Upload, file-ID handoff, signed playback | WF-03, `telegram.proxy.ts`, `telegram.playback.ts` | READY |
| YouTube / Instagram | Workflow reads `user_infrastructure.youtube`; app connect is fake | WF-07/WF-08, `PublishScreen.kt` | MISSING OAuth |
| Storage choice | `storage_choice` saved | `infrastructure.routes.ts` | NOT WIRED |
| Model selection | Chat primary/fallback/vision dropdowns; hardcoded lists | `SettingsScreen.kt` | PARTIAL |
| Image/video models | Hardcoded in GPU script; only worker choice exposed | `infrastructure.routes.ts` | MISSING selection |
| Capability registry | Hardcoded `MUTATING_INTENTS` + risk map | `director.actions.ts` | MISSING |
| Resource readiness | Context has only provider count + GPU flag | `director.context.ts` | MISSING |
| 14 workflow BYOD validation | Not executed | ledger 2026-11-17 | BLOCKED |
| Billing / onboarding | `platform_billing_enabled=false`; no payment code | platform service, migration 005 | MISSING |

Live DB snapshot: 3 tenants, 2 BYOD project-index rows, 4 infrastructure records (Groq 2, Gemini 1, Kaggle 1), 2 Kaggle sessions, 0 YouTube/CPU/GitHub provider records.

---

## 2. Design Principles

1. **BYOD-first, fail-closed.** If a production action needs a user resource and it is missing, the action must fail with a setup instruction. No silent platform fallback for BYOD tenants.
2. **Capability registry is the single source of truth.** One manifest drives prompt, validation, permissions, resources, deep links, Android cards, and tests.
3. **Curated models, not free text.** Users choose from a backend catalog with capability/cost/health metadata. Image/video engines are exposed as validated profiles, not raw model names.
4. **Server-issued actions only.** The client sends an `action_id`; the server revalidates user, project, role, target, resources, context version, and expiry.
5. **Resource readiness before production.** Story, render, QC, and publish each declare required resources; the server and WF-00 enforce them.
6. **No new canonical workflows.** Keep exactly WF-00–WF-13. Add preflight/validation nodes inside existing workflows.
7. **Additive database changes only.** Every migration ships with a rollback script and RLS policies.
8. **Feature flags + per-phase rollback.** Every phase has a kill switch and a documented rollback.
9. **Android cloud CI only.** No Gradle/emulator runs on EC2 or Termux.
10. **No secrets in source, logs, prompts, action payloads, or reports.**

---

## 3. Gap Register

| ID | Gap | Layer | Severity | Phase |
|---|---|---|---|---|
| G-01 | No capability/tool registry; hardcoded intent allowlist | Backend | P0 | 1 |
| G-02 | Director context lacks full resource readiness | Backend | P0 | 2 |
| G-03 | Production actions can silently use platform fallbacks | Backend + n8n | P0 | 2 |
| G-04 | YouTube/Instagram connect is a local toggle, no OAuth | Android + backend + n8n | P0 | 5 |
| G-05 | `cpu_worker` config saved but never consumed | Backend + n8n | P0 | 6 |
| G-06 | `storage_choice` saved but never consumed; no true S3 | Backend + n8n | P0 | 6 |
| G-07 | GitHub token/repository/workflow unused for dispatch | Backend + n8n | P0 | 6 |
| G-08 | 14 workflows unvalidated on BYOD plane | n8n | P0 | 7 |
| G-09 | Chat model catalog hardcoded in Android; OpenRouter/DeepSeek disabled | Android + backend | P1 | 3 |
| G-10 | Image/video model selection absent; engines hardcoded | Backend + n8n + Android | P1 | 3 |
| G-11 | No deep links from Director cards to specialist screens | Android | P1 | 4 |
| G-12 | Director limited to one action per turn; no multi-step plan | Backend + Android | P1 | 4 |
| G-13 | Canon approval, voice list/reset not available in Director | Backend | P1 | 4 |
| G-14 | No production timeline; only command status chip | Android | P1 | 4 |
| G-15 | Director chat text-only; no image/file attachment | Backend + Android | P2 | 4 |
| G-16 | No publish platform selection in action card | Backend + Android + n8n | P1 | 5 |
| G-17 | QC runtime check does not compare actual vs target | n8n | P1 | 7 |
| G-18 | Conversation summary not implemented (last 10 only) | Backend | P2 | 4 |
| G-19 | No per-model usage/cost ledger | Backend | P1 | 8 |
| G-20 | No billing, plans, self-serve onboarding | Backend + Android | P0 (SaaS) | 8 |
| G-21 | No data export/delete lifecycle | Backend | P1 | 8 |
| G-22 | `key_source` hardcoded `'byod'` | Backend | P2 | 3 |
| G-23 | Action secret falls back to `JWT_SECRET` | Backend | P2 | 1 |
| G-24 | No observability/SLOs for Director and workflows | Backend + n8n | P1 | 9 |

---

## 4. Target Architecture

### 4.1 Control flow

```text
Android Director
  → GET /ai/director/capabilities          (catalog, versioned)
  → GET /ai/director/readiness?project_id  (resource matrix)
  → POST /ai/director/chat                 (context + reply + action)
  → POST /ai/director/actions/execute      (revalidate + command)
  → GET /anime/commands/:id                (status/timeline)
  → deep link to specialist screen         (edit / monitor / approve)
```

### 4.2 Capability registry

```ts
interface DirectorCapability {
  key: string;                 // stable key, e.g. GENERATE_EPISODE
  intent: CommandIntent;
  label: string;
  description: string;
  risk: 'read_only' | 'low_risk_write' | 'external_side_effect' | 'destructive';
  required_role: 'viewer' | 'reviewer' | 'editor' | 'admin' | 'owner';
  required_resources: ResourceKey[];
  requires_confirmation: boolean;
  input_schema: Record<string, unknown>;
  preview_fields: string[];
  workflow: WorkflowKey;
  deep_link: string | null;
  enabled: boolean;
  version: number;
}
```

Manifest lives in `src/modules/ai/director/director.capabilities.ts`. It replaces `MUTATING_INTENTS`, `RISK_BY_INTENT`, and the prompt's single example. A static test asserts every capability has a valid intent, workflow mapping, role, and resource list.

### 4.3 Resource readiness keys

```text
database      BYOD tenant or central fallback (explicit mode)
ai_text       provider + model + encrypted key + health
ai_vision     vision-capable model
gpu           Kaggle primary/secondary or custom GPU worker health
cpu           GitHub Actions or own CPU worker health
storage       Telegram or S3 configured + writable
telegram      bot token + chat ID + stream bridge
youtube       OAuth channel connected + token valid
instagram     OAuth channel connected + token valid
github        worker URL + token/repository/workflow (if dispatch used)
```

Readiness result:

```json
{
  "project_id": "...",
  "overall": "blocked",
  "resources": {
    "database": { "status": "ready", "mode": "byod" },
    "ai_text": { "status": "ready", "provider": "gemini", "model": "gemini-2.0-flash" },
    "gpu": { "status": "missing", "reason": "no active Kaggle session or custom GPU" },
    "telegram": { "status": "ready" }
  },
  "blocking": [
    { "capability": "GENERATE_EPISODE", "missing": ["gpu", "telegram"] }
  ]
}
```

### 4.4 Model registry and render profiles

- `ai_model_catalog`: provider, model_id, display name, capabilities (`text`, `vision`, `json`, `embedding`), context window, cost, status, validation flag, minimum plan.
- `user_model_preferences`: purpose (`primary`, `fallback`, `vision`), provider, model_id.
- `render_profiles`: `FAST`, `STANDARD`, `HIGH`; each maps to a validated GPU bundle (SDXL-Lightning, PuLID, AnimateDiff-Lightning, MuseTalk, LivePortrait) and CPU/FFmpeg preset.
- Worker exposes `GET /capabilities` so the server can validate a profile before dispatch.
- FFmpeg is a render stage, not a user-selectable model.

### 4.5 Publishing channels

```text
PublishScreen → OAuth start → provider consent → callback
→ encrypted token in publish_channels
→ channel test
→ Director PUBLISH_NOW action with platform list
→ WF-07 uses backend channel token (no env fallback for BYOD)
```

### 4.6 SaaS control plane

```text
Signup → Workspace → Plan → BYOD setup wizard
→ first project → quota/usage ledger → upgrade/downgrade
→ tenant pause/rotate/export/delete
```

---

## 5. Phase Plan

### Phase 0 — Baseline, Backups, Feature Flags

**Goal:** Make every later phase reversible and measurable.

**Backend**
- Add flags: `DIRECTOR_CAPABILITIES_V2`, `DIRECTOR_READINESS`, `MODEL_CATALOG`, `PUBLISH_OAUTH_V2`, `BYOD_FAIL_CLOSED`, `SAAS_BILLING`.
- Add `DIRECTOR_ACTION_SECRET` requirement (remove `JWT_SECRET` fallback when flag is on).
- Add structured audit log fields: `request_id`, `capability_key`, `resource_snapshot`.

**n8n**
- Export all 14 workflows; store hashes and rollback copies.
- Add correlation ID propagation to WF-00 and callbacks.
- No behavior change.

**Android**
- Confirm CI green on `4c772d8`; add test tags for new Director components.
- No behavior change.

**Database**
- Full backup; staging schema snapshot; no migration.

**Tests**
- Baseline backend suite, static workflow validation, Android CI, BYOD tenant smoke.

**Exit criteria**
- Flags deployable; backups verified; rollback steps documented.

**Rollback:** flags off; restore workflow exports.

---

### Phase 1 — Capability Registry v1

**Goal:** New Director actions require one manifest entry, not five code edits.

**Backend**
- New `src/modules/ai/director/director.capabilities.ts`.
- Replace hardcoded sets in `director.actions.ts`.
- Generate system-prompt action catalog from the manifest.
- Add `GET /api/v1/ai/director/capabilities`.
- Add `capability_version` to action tokens; reject unknown/disabled capabilities.
- Add `director_capability_overrides` table for per-plan/per-tenant enablement.
- Tests: manifest validation, unknown intent rejection, disabled capability rejection.

**n8n**
- Static test: every capability workflow key exists in WF-00 route map.
- No runtime change.

**Android**
- New `DirectorCapabilityDto`, repository call.
- `AIBrainScreen` renders cards from the endpoint; built-in fallback only if endpoint fails.
- Remove hardcoded quick-action list.

**Database**
- `015_director_capability_overrides.sql` (+ rollback): `id`, `capability_key`, `scope` (`global`/`tenant`/`user`), `scope_id`, `enabled`, `config`, `updated_by`, timestamps; RLS.

**Exit criteria**
- Adding a capability in the manifest makes it appear on Android without an app release.
- Contract tests pass; old actions still work behind the flag.

**Rollback:** `DIRECTOR_CAPABILITIES_V2=false` restores hardcoded sets.

---

### Phase 2 — Resource Readiness and Fail-Closed Production

**Goal:** Director knows every resource and cannot start production with missing setup.

**Backend**
- New `src/modules/ai/director/director.readiness.ts`.
- Extend `DirectorContext.resources` with the full readiness matrix.
- Add `GET /api/v1/ai/director/readiness?project_id=`.
- Add `GET /api/v1/anime/infrastructure/readiness`.
- Action validation checks `required_resources`; return `SETUP_REQUIRED` with missing keys and deep links.
- Add setup hints per resource (no secrets).
- Add `resource_health_checks` cache table; refresh on demand and before production.
- Fix `gpu_worker_configured` to distinguish GPU vs GitHub CPU.

**n8n**
- WF-00: call readiness endpoint before dispatch for production intents; block with `SETUP_REQUIRED`.
- WF-03: require explicit `resource_context`; remove silent `$env` fallbacks when `BYOD_FAIL_CLOSED=true`.
- WF-07: require connected publish channel when platform is YouTube/Instagram and fail-closed is on.

**Android**
- Director readiness strip: green/yellow/red per resource.
- Setup cards: "Connect Telegram", "Add Kaggle", "Connect YouTube", "Add CPU worker".
- Confirm button disabled until required resources are ready; show exact missing item.
- Deep links to Settings sections.

**Database**
- `016_resource_health.sql` (+ rollback): `resource_health_checks` (`user_id`, `project_id`, `resource_key`, `status`, `latency_ms`, `evidence`, `checked_at`); indexes; RLS.

**Exit criteria**
- Missing Telegram/GPU/AI blocks the relevant action with a clear message.
- No production action uses a platform fallback for a BYOD tenant when the flag is on.
- Readiness latency < 300 ms cached, < 2 s uncached.

**Rollback:** `BYOD_FAIL_CLOSED=false`; readiness strip hidden.

---

### Phase 3 — Model Catalog and Render Profiles

**Goal:** Users choose validated chat models and render profiles; no app release for new models.

**Backend**
- New `src/modules/ai/models/modelCatalog.ts`.
- Add `GET /api/v1/ai/models/catalog?capability=text|vision|image|video`.
- Add `POST /api/v1/ai/models/select` (`purpose`, `provider`, `model_id`, `render_profile`).
- Provider resolver reads catalog and validates capability (`text`, `vision`, `json`).
- Add OpenAI-compatible/OpenRouter support through `custom` base URL; validate URL and model ID.
- Add `render_profile` to command payload and action preview.
- Add worker capability manifest endpoint: `GET /api/v1/anime/internal/worker/capabilities`.
- Fix `key_source` to return actual source (`byod` or `platform_managed`).

**n8n**
- WF-00: pass `render_profile`; reject unknown profiles.
- WF-03: map profile to validated model bundle; verify worker capabilities before dispatch.
- WF-05: use selected vision model.
- WF-07: use selected metadata model.

**Android**
- Settings: model picker driven by catalog (provider, model, capability badges, cost, health).
- Render profile picker: `FAST`, `STANDARD`, `HIGH` with plain-language tradeoffs.
- Remove hardcoded `AI_PROVIDERS` and model lists.
- Show selected model/profile in Director header.

**Database**
- `017_model_catalog.sql` (+ rollback):
  - `ai_model_catalog` (`provider`, `model_id`, `display_name`, `capabilities`, `context_window`, `input_cost`, `output_cost`, `status`, `validated`, `min_plan`, `metadata`).
  - `user_model_preferences` (`user_id`, `purpose`, `provider`, `model_id`, `render_profile`).
  - `render_profiles` (`key`, `label`, `gpu_bundle`, `cpu_bundle`, `enabled`, `metadata`).
- Seed Groq/Gemini models and three render profiles.

**Exit criteria**
- New model added via DB/API appears in Android without release.
- Invalid/vision-incapable model rejected before chat.
- Render profile mismatch rejected before GPU dispatch.

**Rollback:** `MODEL_CATALOG=false`; old resolver and hardcoded lists.

---

### Phase 4 — Director UX Completion

**Goal:** Director becomes a true control room with deep links, multi-step plans, approvals, and timeline.

**Backend**
- Add `deep_link` to capability manifest; return in capabilities/actions.
- Add `POST /api/v1/ai/director/plan` for multi-step plans (array of proposed actions, dependency order, single confirmation per step).
- Add `APPROVE_CANON_CHANGE` / `REJECT_CANON_CHANGE` capabilities with reviewer role.
- Add `LIST_VOICES` / `RESET_VOICE` read/low-risk capabilities.
- Add `publish_platforms` input to `PUBLISH_NOW`.
- Add conversation summary job (last N turns → summary) and `director_message_attachments`.
- Add `director_action_audit` table; persist every proposal/execution.
- Add attachment upload endpoint for chat (image/file) with size/type limits.

**n8n**
- No new workflow; WF-04/09 handle voice/canon actions already routed by WF-00.

**Android**
- `AIBrainScreen`: timeline with stages (Plan → Render → QC → Publish), deep-link buttons, multi-step plan card, attachment picker, canon approval card, voice picker.
- `AIDirectorViewModel`: plan state, timeline state, attachment upload, deep-link events.
- New components: `DirectorTimeline.kt`, `DirectorPlanCard.kt`, `DirectorAttachmentPicker.kt`, `DirectorSetupSheet.kt`.
- `AppNavGraph`: routes `production/{commandId}`, `qc/{projectId}/{episodeNo}`, `review_inbox`, `publish`, `bible`, `characters`, `episodes`.
- `TokenManager`: persist active plan/action per project.

**Database**
- `018_director_actions_audit.sql` (+ rollback): `director_action_audit`, `director_message_attachments`, `director_conversation_summaries`.
- Add `summary` update job metadata.

**Exit criteria**
- User can go story → plan → render → QC → publish from Director with deep links.
- Canon approval and voice reset work from Director.
- Multi-step plan shows dependencies and per-step confirmation.
- Attachment-based vision request works.

**Rollback:** `DIRECTOR_UX_V2=false`; old single-action cards.

---

### Phase 5 — Publishing OAuth (YouTube / Instagram)

**Goal:** Users connect their own channels; WF-07 publishes with user tokens.

**Backend**
- Tables: `publish_channels`, `publish_oauth_states`.
- Endpoints:
  - `GET /api/v1/anime/publish/channels`
  - `POST /api/v1/anime/publish/oauth/youtube/start`
  - `GET /api/v1/anime/publish/oauth/youtube/callback`
  - `POST /api/v1/anime/publish/oauth/instagram/start`
  - `GET /api/v1/anime/publish/oauth/instagram/callback`
  - `POST /api/v1/anime/publish/channels/:id/test`
  - `POST /api/v1/anime/publish/channels/:id/disconnect`
- Encrypt tokens with existing infrastructure crypto; store scopes, expiry, channel name.
- Refresh tokens before publish; return `CHANNEL_EXPIRED` if refresh fails.
- Validate platform-specific metadata (title length, shorts, hashtags).
- Add `publish_platforms` to `PUBLISH_NOW` action payload.

**n8n**
- WF-07: fetch channel token from backend instead of `$env.YOUTUBE_*`; support platform subset; refresh flow; idempotency; QC gate; retry on 5xx; store published URLs.
- WF-08: read analytics using connected channel.
- Remove env fallback for BYOD tenants when flag is on.

**Android**
- `PublishScreen`: real connect buttons, OAuth Custom Tab/WebView, channel list with status/expiry, test/disconnect, platform selection.
- New `ui/publish/ChannelConnectScreen.kt` and `PublishChannelViewModel.kt`.
- Director publish card shows connected channels and lets user select platforms.

**Database**
- `019_publish_channels.sql` (+ rollback): `publish_channels` (`user_id`, `project_id`, `platform`, `account_ref`, `encrypted_tokens`, `scopes`, `status`, `expires_at`, timestamps), `publish_oauth_states` (`state`, `user_id`, `platform`, `expires_at`, `consumed_at`).
- RLS: owner-only select/insert/update; no token exposure.

**Exit criteria**
- A test user connects YouTube, publishes a QC-approved episode, and sees the URL.
- Expired token returns actionable error.
- No platform env fallback for BYOD.

**Rollback:** `PUBLISH_OAUTH_V2=false`; WF-07 uses env fallback.

---

### Phase 6 — CPU, GitHub, and S3 Wiring

**Goal:** Every resource the user configures is actually used, or removed from the UI.

**Backend**
- Add `cpuDispatch.service.ts`: choose GitHub Actions worker URL or own CPU worker URL; auth token; health check.
- Add GitHub Actions dispatch adapter (`api.github.com/repos/:owner/:repo/actions/workflows/:id/dispatches`) using `github_token`, `repository`, `workflow`.
- Add storage adapter interface: Telegram (existing), S3-compatible (new); signed URL playback.
- Extend readiness: `cpu`, `github`, `storage`.
- Remove dead `cpu_worker`/`storage_choice` or wire them; no silent ignore.

**n8n**
- WF-03: use selected CPU worker; GitHub dispatch when configured; storage selection for upload; FFmpeg preset from render profile.
- WF-07: publish media URL from selected storage.
- WF-13: retry CPU/GitHub jobs with idempotency.

**Android**
- Settings: CPU worker (GitHub/own), Git token/repo/workflow, S3 endpoint/bucket/key; test connection buttons; health badges.
- Director setup cards for missing CPU/storage.
- Production screen shows CPU/storage used.

**Database**
- Extend `user_infrastructure` validation only; no new table required unless S3 secret schema differs.
- `020_worker_capabilities.sql` (+ rollback): `worker_capabilities` (`worker_id`, `type`, `models`, `status`, `last_seen`, `metadata`).

**Exit criteria**
- Own CPU worker runs a TTS/FFmpeg job.
- GitHub dispatch triggers a workflow run.
- S3 upload + signed playback works.
- Removing config produces `SETUP_REQUIRED`, not silent fallback.

**Rollback:** flags per adapter; keep Telegram/GitHub URL path.

---

### Phase 7 — n8n Hardening and 14-Workflow BYOD Validation

**Goal:** All 14 workflows run on the BYOD data plane with no cross-tenant leakage.

**n8n**
- WF-00: readiness preflight, capability validation, publish platform validation.
- WF-02: pass `render_profile`, `resource_context`; block if not ready.
- WF-03: fail-closed resources; worker capability check; CPU/storage selection; no env fallback.
- WF-04: voice list/reset; CPU/Git admin.
- WF-05: catalog vision model.
- WF-07: OAuth channels; platform subset; QC gate; idempotency; retry.
- WF-08: channel analytics.
- WF-09: canon approval actions.
- WF-11: actual vs target runtime (`episodes.target_duration_sec`, clips aggregate, tolerance).
- WF-12: plan-based quota.
- WF-13: retry/idempotency/dead-letter.

**Backend**
- Callback validation, correlation IDs, tenant routing checks, idempotency errors.

**Android**
- Production/QC/Review screens show new states; retry/cancel actions.

**Tests**
- Isolated n8n + BYOD test tenant; all 14 workflows; cross-tenant denial; pause/unpause; DSN rotation; DB-down fail-closed; restore; 7-day rollback.

**Exit criteria**
- 14/14 workflows PASS on BYOD plane with evidence.
- No central fallback for paused/DB-down BYOD tenants.
- Cross-tenant access denied.

**Rollback:** restore workflow exports; disable BYOD rollout flag.

---

### Phase 8 — SaaS Control Plane

**Goal:** Commercial SaaS: plans, quotas, billing, onboarding, tenant lifecycle.

**Backend**
- Tables: `saas_plans`, `subscriptions`, `billing_events`, `usage_ledger`, `onboarding_state`.
- Endpoints: plans, checkout, webhook, subscription status, usage, invoices.
- Plan enforcement in `executionGuard` and WF-12: RPM/RPD, renders/month, storage, seats.
- Provider decision: Razorpay (India-first) or Stripe (global). Keep adapter interface.
- Onboarding wizard API: workspace → BYOD DB → AI → GPU/CPU → storage → first project.
- Data export/delete job; retention policy.
- Admin console metrics: MRR, active tenants, failed payments, usage overages.

**n8n**
- WF-12 quota governor reads plan/usage.
- Billing webhook → subscription state → tenant pause/resume.
- Notification workflow for payment failure/usage limit.

**Android**
- New `ui/onboarding/OnboardingScreen.kt` (wizard).
- New `ui/billing/PlanScreen.kt`, `UsageScreen.kt`, `InvoiceScreen.kt`.
- Settings shows plan, usage, upgrade; owner console shows tenant billing.
- Director setup cards link to onboarding.

**Database**
- `021_saas_billing.sql` (+ rollback): plans, subscriptions, billing events, usage ledger, onboarding state, indexes, RLS.

**Exit criteria**
- New user signs up, connects BYOD resources, generates first video, upgrades plan.
- Quota enforcement and invoices work.
- Failed payment pauses production, not data access.

**Rollback:** `SAAS_BILLING=false`; manual plan assignment.

---

### Phase 9 — Observability, Canary, GA

**Goal:** Operate the SaaS with evidence and safe rollout.

**Backend**
- Metrics: Director chat/action latency, readiness failures, provider errors, render success rate, publish success rate, cost per tenant.
- Correlation IDs end-to-end; structured logs; alerts.
- SLOs: chat p95, render dispatch p95, publish success, error budget.

**n8n**
- Execution alerts, dead-letter dashboards, retry metrics.

**Android**
- Crash/analytics, remote config for flags, in-app diagnostics.

**Tests**
- Load test readiness/chat; security scan; regression; rollback drill; canary 10% → 50% → 100%.

**Exit criteria**
- SLOs met for 7 days; rollback drill passed; GA approved.

**Rollback:** kill switches per capability and per workflow.

---

## 6. API Contracts (New)

### Capabilities

`GET /api/v1/ai/director/capabilities`

```json
{
  "version": "2026-11-18.1",
  "capabilities": [
    {
      "key": "GENERATE_EPISODE",
      "intent": "GENERATE_EPISODE",
      "label": "Generate Episode",
      "risk": "external_side_effect",
      "required_role": "editor",
      "required_resources": ["ai_text", "gpu", "cpu", "telegram"],
      "requires_confirmation": true,
      "deep_link": "production",
      "workflow": "WF-02",
      "enabled": true
    }
  ]
}
```

### Readiness

`GET /api/v1/ai/director/readiness?project_id=...`

```json
{
  "overall": "blocked",
  "resources": {
    "database": { "status": "ready", "mode": "byod" },
    "ai_text": { "status": "ready", "provider": "gemini", "model": "gemini-2.0-flash" },
    "ai_vision": { "status": "ready" },
    "gpu": { "status": "missing", "reason": "no active Kaggle session" },
    "cpu": { "status": "ready", "mode": "github_actions" },
    "storage": { "status": "ready", "mode": "telegram" },
    "telegram": { "status": "ready" },
    "youtube": { "status": "missing" }
  },
  "blocking": [
    { "capability": "GENERATE_EPISODE", "missing": ["gpu"] }
  ]
}
```

### Model catalog

`GET /api/v1/ai/models/catalog?capability=text`

```json
{
  "models": [
    {
      "provider": "gemini",
      "model_id": "gemini-2.0-flash",
      "display_name": "Gemini 2.0 Flash",
      "capabilities": ["text", "vision", "json"],
      "context_window": 1000000,
      "input_cost": 0.0,
      "output_cost": 0.0,
      "status": "active",
      "validated": true
    }
  ],
  "render_profiles": [
    { "key": "FAST", "label": "Fast", "description": "SDXL-Lightning, quick motion" }
  ]
}
```

### Publish channels

```text
GET  /api/v1/anime/publish/channels
POST /api/v1/anime/publish/oauth/youtube/start
GET  /api/v1/anime/publish/oauth/youtube/callback
POST /api/v1/anime/publish/channels/:id/test
POST /api/v1/anime/publish/channels/:id/disconnect
```

### Action execute

Existing contract remains:

```json
POST /api/v1/ai/director/actions/execute
{ "action_id": "act...", "project_id": "..." }
```

New error codes: `SETUP_REQUIRED`, `CAPABILITY_DISABLED`, `MODEL_INVALID`, `PROFILE_INVALID`, `CHANNEL_MISSING`, `CHANNEL_EXPIRED`.

---

## 7. Database Migration Plan

All migrations additive, idempotent, with rollback scripts and RLS.

| Migration | Contents |
|---|---|
| `015_director_capability_overrides.sql` | capability overrides per global/tenant/user |
| `016_resource_health.sql` | resource health cache |
| `017_model_catalog.sql` | model catalog, user preferences, render profiles |
| `018_director_actions_audit.sql` | action audit, attachments, conversation summaries |
| `019_publish_channels.sql` | publish channels + OAuth states |
| `020_worker_capabilities.sql` | worker capability registry |
| `021_saas_billing.sql` | plans, subscriptions, billing events, usage ledger, onboarding |

Rules:
- Never drop existing columns/tables.
- Backfill from `user_infrastructure`, `story_bible.episode_duration_min`, and existing `wallet_ledger`.
- Run in staging first; verify RLS with a non-owner token.
- Every migration has a matching `_rollback.sql`.

---

## 8. Android Screen-by-Screen Change Matrix

| Screen / file | Change | Phase |
|---|---|---|
| `ui/brain/AIBrainScreen.kt` | Dynamic capability cards, readiness strip, timeline, deep links, plan card, attachments, publish platform picker | 1–4 |
| `ui/brain/AIDirectorViewModel.kt` | Capabilities/readiness/model state, plan state, timeline polling, attachment upload, deep-link events | 1–4 |
| `ui/brain/AIDirectorViewModelProvider.kt` | Scope plan/timeline state | 4 |
| New `ui/brain/DirectorTimeline.kt` | Stage timeline (Plan/Render/QC/Publish) | 4 |
| New `ui/brain/DirectorPlanCard.kt` | Multi-step plan with per-step confirm | 4 |
| New `ui/brain/DirectorReadinessStrip.kt` | Resource readiness chips | 2 |
| New `ui/brain/DirectorSetupSheet.kt` | Missing-resource setup + deep links | 2 |
| `ui/settings/SettingsScreen.kt` | Catalog model picker, render profile, resource readiness, YouTube OAuth, CPU/Git/S3 | 3, 5, 6 |
| New `ui/settings/ModelCatalogScreen.kt` | Provider/model/capability/cost browser | 3 |
| New `ui/settings/ResourceSetupScreen.kt` | Guided DB/AI/GPU/CPU/storage setup | 2 |
| `ui/publish/PublishScreen.kt` | Real OAuth connect, channel list, test/disconnect, platform selection | 5 |
| New `ui/publish/ChannelConnectScreen.kt` | OAuth Custom Tab/WebView + callback handling | 5 |
| `ui/production/ProductionScreen.kt` | Deep-link target, stage timeline, retry/cancel, resource used | 4, 7 |
| `ui/production/ProductionViewModel.kt` | Timeline state, resource metadata | 4 |
| `ui/qc/QCScreen.kt` | Actual vs target runtime, tolerance, approve/reject | 7 |
| `ui/review/ReviewInboxScreen.kt` | Canon approval cards from Director | 4 |
| `ui/advanced/QuotaDashboardScreen.kt` | Plan usage, limits, upgrade CTA | 8 |
| New `ui/billing/PlanScreen.kt` | Plans, checkout, invoices | 8 |
| New `ui/onboarding/OnboardingScreen.kt` | Workspace → BYOD → AI → GPU/CPU → storage → first project | 8 |
| `ui/navigation/AppNavGraph.kt` | Deep-link routes: `production/{commandId}`, `qc/{projectId}/{episodeNo}`, `publish/oauth/{platform}`, `settings/{section}` | 2, 4, 5 |
| `core/network/AnimeApiService.kt` | Capabilities, readiness, catalog, channels, OAuth, plan endpoints | 1–8 |
| `core/network/AnimeRepository.kt` | Repository methods + error mapping | 1–8 |
| `core/model/DirectorCapabilityDto.kt` | New DTOs | 1 |
| `core/model/ResourceReadinessDto.kt` | New DTOs | 2 |
| `core/model/ModelCatalogDto.kt` | New DTOs | 3 |
| `core/auth/TokenManager.kt` | Persist plan/action, clear on logout | 4 |
| `ui/components/SharedComponents.kt` | Shared readiness/action card components | 1–4 |

Android rules:
- No hardcoded intent lists or model lists.
- All new screens use existing design tokens.
- All network calls go through repository interfaces.
- Cloud CI only; no local Gradle.

---

## 9. n8n Workflow-by-Workflow Change Matrix

| Workflow | Change | Phase |
|---|---|---|
| WF-00 Main Router | Readiness preflight, capability validation, publish platform validation, correlation IDs | 2, 5, 7 |
| WF-01 Story Bible | Pass resource context; no behavior change beyond model selection | 3 |
| WF-02 Story/Episode | Pass `render_profile`, `resource_context`; block if not ready; WF-03 dispatch | 2, 3 |
| WF-03 Production | Profile→model bundle, worker capability check, CPU/Git/S3 selection, fail-closed, remove env fallback | 2, 3, 6, 7 |
| WF-04 Admin/Voice | Voice list/reset, CPU/Git admin, model/profile metadata | 3, 4, 6 |
| WF-05 Vision | Catalog vision model, attachment input | 3, 4 |
| WF-06 Continuity | No change beyond context | 7 |
| WF-07 Publish | OAuth channels, platform subset, QC gate, idempotency, retries, no env fallback | 5, 7 |
| WF-08 Analytics | Channel-based analytics | 5 |
| WF-09 Canon | Approval/rejection actions | 4 |
| WF-10 State | Notifications for readiness/publish/billing | 2, 8 |
| WF-11 QC | Actual vs target runtime, tolerance, evidence | 7 |
| WF-12 Quota | Plan-based RPM/RPD/render quotas | 8 |
| WF-13 Retry | Idempotent retry, dead-letter, resource recheck | 7 |

Constraints:
- Exactly 14 workflows; no WF-14.
- No secrets in JSON; tokens come from backend gateway.
- Every workflow change ships with a rollback export.

---

## 10. Test and Acceptance Matrix

| Layer | Tests |
|---|---|
| Unit | Capability manifest, readiness resolver, model validation, risk/role, duration math, quota |
| Contract | Capabilities, readiness, catalog, action execute, error codes, OAuth callbacks |
| Integration | BYOD DB routing, AI key use, missing resource block, model/profile rejection, Telegram/S3, YouTube publish |
| n8n static | 14/14 JSON validation, route map vs capability registry, no secrets |
| n8n runtime | 14/14 on isolated BYOD tenant, cross-tenant denial, pause/rotate/restore, retry |
| Android JVM | ViewModel state, capability cards, readiness strip, deep links, plan flow |
| Android instrumentation | Director screen, sheet sync, OAuth WebView, timeline, settings |
| Android Maestro | Signup → BYOD setup → first project → Director render → QC → publish |
| Security | Secret scan, token expiry, forged action, cross-tenant, RLS, OAuth state CSRF |
| Load | Readiness p95, chat p95, dispatch p95, 100 concurrent commands |
| Regression | Existing screens, 14 workflows, existing command intents, media playback |
| Rollback | Per-phase flag off, workflow restore, migration down, canary rollback |

Acceptance labels: `PASS`, `FAIL`, `BLOCKED`, `NOT TESTED`. Static/mocked results are not runtime proof.

---

## 11. Rollout and Rollback

### Rollout

1. Dev environment with isolated DB/n8n/workers.
2. BYOD test tenant (`f91f5074-...`) with one project.
3. Internal canary (owner account) 10%.
4. Paid beta 50% with feature flags.
5. GA 100% after 7-day SLO window.

### Rollback

| Phase | Rollback |
|---|---|
| 1 | `DIRECTOR_CAPABILITIES_V2=false` |
| 2 | `BYOD_FAIL_CLOSED=false` |
| 3 | `MODEL_CATALOG=false` |
| 4 | `DIRECTOR_UX_V2=false` |
| 5 | `PUBLISH_OAUTH_V2=false`; restore WF-07 export |
| 6 | adapter flags; keep Telegram/GitHub URL path |
| 7 | restore 14 workflow exports; disable BYOD rollout |
| 8 | `SAAS_BILLING=false`; manual plans |
| 9 | kill switches per capability/workflow |

Database rollbacks are additive-down scripts; never destructive to user data.

---

## 12. Risks and Open Decisions

| Risk / decision | Impact | Recommendation |
|---|---|---|
| Billing provider (Razorpay vs Stripe) | Checkout, taxes, subscriptions | Razorpay for India-first; adapter interface |
| Free plan BYOD mandatory? | Cost and abuse | BYOD mandatory on Free; platform-managed only on paid |
| YouTube OAuth app verification | Publish launch delay | Start Google verification early |
| Instagram/Meta permissions | Reels publishing | Confirm app review scope |
| Platform fallback policy | Cost leakage vs UX | Never for BYOD tenants; explicit paid platform plan |
| Image/video model bundles | Quality/VRAM/support | Start with 3 validated profiles |
| Kaggle worker stability | Render failures | Health checks, heartbeats, auto-restart |
| Android release cadence | Slow fixes | Backend-driven capabilities/models |
| Schema drift | Migration failures | Snapshot + staging first |
| Data retention/export | Compliance | Define 30/90-day policy in Phase 8 |

Open decisions requiring Owner approval before Phase 1:
1. Billing provider.
2. BYOD mandatory on Free plan.
3. Initial render profile bundles.
4. YouTube/Instagram OAuth app ownership.
5. Platform-managed plan pricing and limits.
6. Data retention/export policy.

---

## 13. Execution Order and Timeline

| Phase | Duration | Depends on | Key deliverable |
|---|---|---|---|
| 0 | 2–3 days | — | Flags, backups, baseline |
| 1 | 5 days | 0 | Capability registry |
| 2 | 5 days | 1 | Readiness + fail-closed |
| 3 | 5 days | 2 | Model catalog + profiles |
| 4 | 7 days | 1–3 | Director UX completion |
| 5 | 7 days | 2 | YouTube/Instagram OAuth |
| 6 | 5 days | 2, 3 | CPU/Git/S3 wiring |
| 7 | 7 days | 2–6 | 14-workflow BYOD validation |
| 8 | 10 days | 2, 7 | SaaS billing/onboarding |
| 9 | 5 days | all | Canary + GA |

Total: ~12–14 weeks with one senior full-stack engineer; Android and n8n work can run in parallel after Phase 1.

Strict order: 0 → 1 → 2 → 3 → 4/5/6 → 7 → 8 → 9. Phase 5 and 6 can run in parallel with 4 after Phase 2.

---

## 14. Definition of Done

A phase is done only when:

1. Code merged with tests and CI green.
2. Migration applied in staging with rollback verified.
3. n8n workflow export diff reviewed; no secret leak.
4. Android CI green; manual device check where required.
5. Feature flag documented; rollback tested.
6. Evidence recorded in the ledger with commit/image/run IDs.
7. Owner acceptance recorded for the phase gate.

Final GA definition:

- A new user can sign up, connect their own DB/AI/GPU/CPU/storage/YouTube, generate a video, pass QC, and publish — all from the AI Director with approvals.
- No silent platform fallback for BYOD tenants.
- 14/14 workflows validated on the BYOD plane.
- SLOs met for 7 days; rollback drill passed.
- Billing, quotas, onboarding, and data lifecycle working.
