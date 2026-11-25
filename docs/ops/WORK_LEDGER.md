# AI Anime — Work Ledger

> Read this file first. Max target: 200 lines. Do not load all session files.
> Detailed history: `docs/ops/sessions/`
> Current truth wins over old audit/plan docs.
> Last updated: 2026-11-24

## Read Protocol — token-smart

1. Read this ledger only.
2. Read the latest linked session file only if the task needs detail.
3. Open evidence files only for the current task.
4. Do not load all session archives, full audit dumps or full n8n JSON.
5. Use targeted search for old decisions; never paste chat transcripts here.
6. At session end: update Current State, Next 3, Session Index; append one session file.

## Current State

- Product model: BYOD-first SaaS; user-owned AI/GPU/CPU/storage/DB. Platform-managed remains opt-in/disabled.
- Plan status: implementation approved. P0-A/B/C/D/E, P1, P2 and P3 are done; P4 rollout remains partial.
- Runtime contract (2026-11-23): episode duration 1–30 min is canonical; script/beat/scene/shot/dialogue budgets are derived. Backend `1104d74`, Android `527056e`, CPU `4e89548` merged; backend/CPU CI and Android CI green.
- Execution plan (2026-11-23): [Gates 0–2 executed; Gates 3–4 blocked](EXECUTION_VERIFICATION_PLAN_2026-11-23.md). Remaining blockers: no active GPU session and no authenticated E2E test project.
- Seven-wave remediation (2026-11-23/24, branch `remediation/2026-11-23`, uncommitted): W1 identity + W2 duration verified; W3 GPU animation + W4 CPU audio fixed; W5 QC `PENDING` root cause fixed with auto RUN_QC + honest WF-11 duration + approval; W6 Android season-aware QC/approval; W7 outbox lease/RLS source checks. Backend unit 216/routes 110/static 163, CPU 32 pytest green. Live GPU/E2E/n8n/Android CI/RLS UNVERIFIED.
- EC2 opencode context (2026-11-23): work ledger, execution plan and session copied to `~/ai-backend/docs/ops/`; EC2 `AGENTS.md` and system ledger now point to them.
- Plan shape: **5 major phases (P0–P4); 9 execution gates** (P0-A…P0-E, P1…P4).
- Production: GPU safety live; Kaggle worker stopped; no active Kaggle sessions.
- Local verification (2026-11-23): backend build + 210 unit + 110 routes + 157 static + 22 regression pass; CPU `py_compile` + 32 pytest pass. Android CI `45107179474` / `45107179489` green (build, JVM, lint, Maestro, Compose). Owner requires CI-only Android runs.
- Production deploy (2026-11-23): backend image `anime-backend:runtime-1104d74` built from commit and deployed; public health `{"ok":true,"db":"up"}`. Rollback image `anime-backend:rollback-20261123T032934Z`. CPU worker run `45106463435` on `main`; tunnel URL synced to backend env and two encrypted infrastructure rows. Live n8n `storywf02` v27 and `storywf03` v32, both healthy.
- Test APK: unsigned debug build from CI run `44311499819` published at `https://github.com/bnaisolution/ai-anime-android/releases/tag/v1.0.0-director.20261118`.
- Last audit: 2026-11-18 (Android chat, backend AI/BYOD, project runtime, commands/workflows).
- Director onboarding (2026-11-19): readiness is project-optional; BYOD/SaaS → project settings → Bible approval → cast → production order is exposed; production commands and Director actions are setup-gated; Bible approval persists cast/arc/power/relationship/location/artifact/rule entities.
- Director phases continuation (2026-11-19): project creation and settings are Director-capable; Bible drafts expose `draft_id` and explicit apply aliases; publish requires QC, episode approval and a PUBLISH approval. Backend `34cbbc8` deployed code-only; Android `e26c6d2` pushed; Android CI green. Migrations `015–021` still pending.

## Locked Decisions

- Preserve standalone Android + Fastify + Supabase architecture and RLS.
- Preserve exactly 14 canonical workflows WF-00–WF-13. No new n8n workflows. Logic fixes inside existing workflows are allowed.
- AI Director is an orchestration interface inside the existing app; not a separate dashboard.
- Detailed editing stays in existing specialist screens.
- Normal users must not silently use platform AI credentials when BYOD is missing.
- `episode_duration_min` in Story Bible is the canonical configured duration source; target/actual runtime are derived snapshots.
- AI Director actions must be server-issued and server-revalidated; no regex action inference.
- One shared Director ViewModel/controller for full screen and bottom sheet.
- Project owner does not automatically receive platform-admin rights.
- Autopilot is disabled by default; future autopilot needs limits, pause/stop and audit history.
- No secrets, tokens, keys or private env values in this ledger.

## AI Director Plan — 5 phases / 9 gates

| Major phase | Gate | Status |
|---|---|---|
| P0 | P0-A | Done: secrets encrypted/masked; non-owner reads redacted |
| P0 | P0-B | Done: n8n canonical hashes verified; live DB gaps recorded |
| P0 | P0-C | Done: encrypted BYOD resolver; chat has no platform fallback |
| P0 | P0-D | Done: DirectorContext + canonical duration propagation |
| P0 | P0-E | Done: quota reservation, conversation persistence, signed action contract |
| P1 | P1 | Done: shared Android Director VM, action cards, command timeline; main + androidTest Kotlin compile |
| P2 | P2 | Done: approvals idempotency, canon routing, publish gate, adapter routing, vision SAVE contract; deployed |
| P3 | P3 | Done: bounded context, semantic BYOD memory retrieval, project memory, quota state |
| P4 | P4 | Partial: director metrics + regression tests; production rollout/alerts/load test not started |

## Implemented / Verified

- P0-A: provider config and BYOI secrets encrypted at rest, masked on read; non-owner access denied.
- P0-C: `providerResolver` selects encrypted active BYOD providers; `callByodModel` never falls back to env/platform keys for normal users.
- P0-D: Story Bible `episode_duration_min` default 24; explicit/persisted/executing target precedence; `TARGET_CONFLICT`; scene distribution and clip runtime aggregation.
- P0-E: HMAC action tokens with target/role/risk/expiry/context version/nonce; structured action blocks only; Director conversations persisted; quota now reserves RPM/TPM/RPD in process before calls.
- P1: `AIDirectorViewModel` shared across AI Brain and global sheet; persisted project chat; project switch reload; action confirm; command polling with backoff; action cards; provider/context badges.
- P2: approval decisions accept `Idempotency-Key`; replay is safe; only `CANON_CHANGE` auto-submits `APPROVE_CANON_CHANGE`; publish commands no longer report success without publish evidence; `/api/v1/ai/execute` routes through hardened WF-00 adapter.
- P3: `compactDirectorContext` is valid JSON, bounded to 14k chars, truncates large Bible/cast/episode; Director memory retrieval is semantic and uses the user's BYOD Gemini embedding key before project-scoped lexical/recent fallback.
- P4: `ai_director_chat_total`, `ai_director_action_executions_total`, and duration histogram added; static regression locks director persistence to `animeSupabase`.
- Vision: `/vision/analyze` now carries explicit `mode`/`save_to_character`/`character_code` into WF-05; SAVE no longer silently becomes QUICK, and Android sends the same contract.

## Live Inventory — 2026-11-18

- Production URL: `https://api.bnai.dpdns.org`; public health `GET /v1/anime/health` returned `{"ok":true,"db":"up"}` after deploy.
- Containers: `ai-backend` image `anime-backend:director-gap4-20261120` with `/app/dist` from `5dddaad`; `n8n` healthy.
- n8n has 28 workflows: 14 canonical `Story*` workflows active and **exactly matching repo node/connection hashes**; 12 legacy `WF-01…WF-12` duplicates active; legacy `WF-00` and 1 test workflow inactive.
- Anime DB exposes 87 tables. Present: `approval_decisions`, `episodes`, `clips.duration_sec`, `memory_knowledge`, `story_memory`.
- Migrations `013`/`014` applied: `director_conversations` and `director_messages` exist with RLS enabled; `episodes.target_duration_sec` and `approval_decisions.decision_idempotency_key` exist.
- Pre-deploy backups: DB `/home/ec2-user/backups/anime-20261118T131529Z.dump` (8.4M), container dist `/home/ec2-user/backups/backend-dist-20261118T131529Z.tgz` (166K), `/home/ec2-user/backups/backend-dist-20261119T124911Z.tgz`, and `/home/ec2-user/backups/backend-dist-20261119T130153Z.tgz`. RLS was verified statically; live policy introspection remains pending.

## Remaining P0/P2/P3/P4 Gaps

- Retire/disable legacy duplicate n8n workflows only after explicit Owner approval; canonical 14 stay.
- Verify live RLS policies with a DB DSN or approved SQL introspection.
- P4 rollout, dashboards/alerts, load checks and staged Android/backend release are not done.
- Android runtime/device smoke test is not done; only Kotlin compilation, CI emulator tests and static tests were run.
- Signed release APK is blocked by missing Android keystore GitHub secrets; current artifact is debug/unsigned.

## Wave Execution Status (2026-11-23)

| Wave | Status | Evidence |
|---|---|---|
| W1 Identity | DONE (source+static) | WF-00 season/title/synopsis propagation + season-aware idempotency; WF-11 season-aware QC |
| W2 Duration | DONE (verified+tests) | 1–30 min contract, act batching, WF-03 gate; runtime matrix 4 tests |
| W3 Animation | DONE (source only) | GPU v2v reference conditioning + honest stage status; py_compile OK; GPU run UNVERIFIED |
| W4 Audio | DONE (source+tests) | ducking_db → BGM gain; ffmpeg audio_stats; 32 pytest pass; live render UNVERIFIED |
| W5 QC | DONE (source+tests) | nested callback media + output_media merge; auto RUN_QC enqueue; WF-11 honest duration; human approval closes task |
| W6 Android | DONE (source only) | season-aware QCScreen + canonical approval endpoint; CI build UNVERIFIED |
| W7 Reliability | DONE (source+static) | outbox lease + migration 010 grants verified; live RLS UNVERIFIED |

- Working branch: `remediation/2026-11-23` in all three repos, based on origin/main (backend `1104d74`, Android `527056e`, CPU `4e89548`). All changes uncommitted.
- Preserved: backend stash `pre-remediation-local-work-20261123` + patch `~/backups/remediation-20261123/backend-dirty-tracked.patch`; CPU branch `backup/local-ad8c815`.
- Master prompt (merged v2.1): `docs/ops/MASTER_REMEDIATION_PROMPT_2026-11-23.md`. Detail: `docs/ops/sessions/2026-11-23-waves-2-7-execution.md`.
- Live n8n NOT updated (needs approval); repo workflow JSON is source of truth.
- Tests (docker `anime-backend:runtime-1104d74`): unit 216, routes 110, static 163 green; CPU 32 pytest green.

## Next 3 Steps

1. Get approval to sync WF-00/WF-11 and deploy backend, then run one real 1-minute episode: MIXED → auto RUN_QC → PENDING_HUMAN_APPROVAL → approve → publish.
2. Start a GPU session and run the 1/5/30-minute matrix, capturing actual master duration + audio stats.
3. Approve Android branch push for CI build + emulator tests; then run live RLS introspection when DSN access is provided.

## Open Decisions

- Approve deactivation/archive of the 12 active legacy duplicate n8n workflows plus inactive legacy `WF-00`.
- Approve live RLS introspection method (DSN or read-only SQL job).
- Provide Android signing secrets if a signed release build is required.

## Session Index

| Date | Session | Summary |
|---|---|---|
| 2026-11-23 | [W1 identity](sessions/2026-11-23-wave1-identity.md) | WF-00/WF-11 season-aware identity fixed; static 160 + unit 210 + routes 110 pass |
| 2026-11-23/24 | [W2–W7 execution](sessions/2026-11-23-waves-2-7-execution.md) | Duration verified, GPU animation/CPU audio fixes, QC root cause + auto RUN_QC, Android season/approval, outbox/RLS source checks |
| 2026-11-18 | [AI Director audit + plan review](sessions/2026-11-18-ai-director-audit.md) | Kaggle stop, GPU safety deploy, full AI Director/BYOD/duration audit, prompt review, corrected v2 plan |
| 2026-11-18 | [AI Director implementation](sessions/2026-11-18-ai-director-implementation.md) | P0/P1/P2/P3 implementation, vision SAVE fix, green CI, production deploy, test APK release |
| 2026-11-19 | [Director onboarding + Bible entities](sessions/2026-11-19-director-onboarding.md) | Project-optional readiness, setup gates, Bible entity persistence, Android onboarding card, green backend tests + Android CI |
| 2026-11-19 | [Director project, draft and publish gates](sessions/2026-11-19-director-phases.md) | Director project creation/settings, Bible draft IDs, publish approval state machine; backend `34cbbc8` deployed code-only + Android `e26c6d2` CI green; migrations blocked on central DSN |
| 2026-11-22 | [Runtime contract P0–P8](sessions/2026-11-22-runtime-contract-p0-p8.md) | Canonical 1–30 min contract, act-batched WF-02, WF-03 duration gate, GPU identity/lipsync hooks, CPU audio fixes, code-only backend deploy |
| 2026-11-23 | [Execution & verification plan](EXECUTION_VERIFICATION_PLAN_2026-11-23.md) | Commit/push, reproducible backend image, CPU/GPU deploy, 1/5/30-min E2E, duration and quality gates |
| 2026-11-23 | [Gates 0–2 execution](sessions/2026-11-23-gates-0-2-execution.md) | Backend/Android/CPU merged and CI green; backend image deployed; CPU worker tunnel synced; GPU/E2E blocked |

## New Session Entry Template

```md
# YYYY-MM-DD — short title

## Goal
## Completed
## Verified
## Unverified / blocked
## Files and evidence
## Decisions
## Next 3
## Rollback / risk
```

## Size Policy

- This ledger stays under ~200 lines. Older detail moves into dated session files.
- Session files stay focused; link evidence instead of copying it.
- If a session file grows beyond ~150 lines, split by topic.
