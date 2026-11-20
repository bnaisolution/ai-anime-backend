# AI Director First Onboarding Plan (Authoritative)

Status: APPROVED FOR IMPLEMENTATION
Owner: Product + Engineering
Last updated: 2026-11-19
Source: User-provided Director-first plan, audited against backend `34cbbc8` and Android `e26c6d2`.

## Why this document exists

This is the permanent source of truth for the AI Director first-onboarding work.
Future sessions must read this file before changing Director onboarding, Bible
persistence, studio prefill, approval gates, migrations, or deployment.

Do not replace this plan with ad-hoc gates or side quests. If scope changes,
update this document with an explicit decision and date.

## Implementation Status

Last verified: 2026-11-20.

| Phase | Status | Evidence |
|---|---|---|
| 0 Baseline freeze | Complete | Local/remote/EC2 checkouts synced; migration gap documented. |
| 1 Projectless Director chat | Complete | Backend `1420c78`, Android `b098dc0`; backend and Android CI green. |
| 2 Bible draft/apply correctness | Complete | Backend `e5c7685`, Android `c7ea942`; full backend suite green. Atomic RPC remains a follow-up. |
| 3 Studio prefill + first episode | Complete | Backend `707e197`, Android `4cde5b9` + `e9dd1a0`; static contracts and CI green. |
| 4 Approval gates + bypass closure | Complete | Backend `19e1ee7`, Android `b84efe0`; gate tests, Director failure-reason/retry, and Android tests green. |
| 5 Migrations/deploy/E2E | Partial | Migrations `015`–`021` applied; `anime-backend:director-onboarding-c2de9e8` deployed; backup verified; BYOD Director E2E and 12/12 hardening drills green. Full Bible→episode→publish E2E, rollback restore drill, Android device smoke, and WF-03/WF-08 validation remain. |

## Target Flow

```text
No project
  -> Director chat starts
  -> Director asks project basics
  -> project created
  -> project settings
  -> Story Bible draft
  -> Bible approved
  -> entities persisted
  -> studio modules prefill
  -> first episode plan
  -> production approval gates
  -> QC
  -> publish approval
  -> publish-ready
```

Rules:

- Director must work before a project exists.
- n8n executes workflows; Director orchestrates; backend validates, persists,
  and routes; Android never bypasses approval gates.
- Bible is generated as a draft first. Nothing is persisted until approval.
- BYOD projects use the tenant data plane; central DB is not the write target
  for creative project data.
- Production approvals are server-enforced, including direct commands.
- Android is verified through GitHub Actions only. Do not run local Gradle.
- No new n8n workflows. Use canonical WF-00 through WF-13 only.

## Baseline At Plan Freeze

- Backend local/remote: `34cbbc8`.
- Android local/remote: `e26c6d2`.
- Backend live container: `anime-backend:director-gap4-20261120`, dist from
  `34cbbc8`.
- EC2 backend checkout: `d0e3cad` (behind live container).
- EC2 Android checkout: `77e3254` (behind local).
- Backend tests: unit 199, routes 109, static 145, regression 22.
- Android CI: Build APK `44515996411`, Android Tests `44515995486`.
- Migrations `015` through `021` are not applied to the live central DB.
- Central Postgres DSN is not available on EC2; only the separate BYOD tenant
  test DSN exists locally.
- Projectless Director chat is blocked in:
  - `AIDirectorViewModel.sendMessage()`.
  - `AIBrainScreen` send button.
  - Global Director bottom sheet send button.
- Create-project flow reuses `createEpisodes` for `targetEpisodeCount`.
- `CharacterViewModel` still uses `SAVE_BIBLE` for character creation.
- Studio prefill from approved Bible is incomplete.
- Bible apply uses compensating rollback, not a single DB transaction.
- Approval bypasses remain in direct-command paths.

## Phase 0: Baseline Freeze

Goal: one source of truth for local, Git, EC2, and Docker.

Work:

- Sync EC2 backend checkout to the live deployed SHA.
- Sync EC2 Android checkout to the latest pushed Android SHA.
- Record local SHA, remote SHA, EC2 SHA, and container dist SHA.
- Record migration status.
- Freeze unrelated features until Director first-onboarding E2E is green.

Acceptance:

- Local/remote/EC2 backend SHAs match the live runtime source.
- Local/remote/EC2 Android SHAs match.
- Docker image and dist SHA are documented.
- Migration status is documented.

## Phase 1: Projectless Director Chat

Goal: Director works before a project exists.

Backend:

- Allow Director chat without `project_id`.
- No project: no production actions, no project facts invented, no server-side
  project-scoped persistence unless an onboarding session is explicitly added.
- Add onboarding-mode prompt behavior: ask project basics and guide creation.
- Keep the existing `POST /director/setup/project` endpoint as the final create
  step.
- Production intents fail closed without a project.

Android:

- Remove blank-project send guards in `AIDirectorViewModel` and both chat UIs.
- Show onboarding suggestions instead of project-only actions.
- Keep project-scoped suggestions hidden until a project exists.
- After create, stay in Director, activate the project, refresh readiness, and
  continue to Bible onboarding.
- Fix `targetEpisodeCount` so multi-season projects use
  `episodesPerSeason * seasons`, not `episodesPerSeason`.
- Block project-only actions while projectless.

Acceptance:

- Chat works with no project.
- Director asks for project basics.
- Project creation does not dead-end in studio.
- Readiness refresh shows the next Bible step.
- No production action can run without a project.

## Phase 2: Bible Draft + Apply Correctness

Goal: approved Bible becomes the single persistent source of truth.

Work:

- Make Bible apply atomic in the data plane.
- Persist all entities: story bible, characters, visual DNA, voices,
  relationships, arcs, powers, locations, and artifacts.
- Use stable entity keys for idempotent upserts.
- Validate references before apply.
- Reject apply without an approved draft.
- Retry must not duplicate entities.
- Remove `SAVE_BIBLE` character-create shortcuts from Android.
- Bible UI must show draft, approve, reject, and applied counts clearly.

Acceptance:

- One approval persists all entities.
- Repeated apply is idempotent.
- Invalid references fail before writes.
- Partial failure leaves no inconsistent state.

## Phase 3: Studio Prefill + First Episode

Goal: approved Bible flows into production without manual re-entry.

Work:

- Prefill character, voice, storyboard, art, location, and artifact surfaces
  from approved Bible entities.
- WF-02 and WF-03 consume persisted characters and voices instead of
  placeholders.
- Separate first-episode planning from media-generation readiness.
- A fresh project with zero scenes can plan its first episode.
- First episode uses approved cast, voices, and visual DNA.

Acceptance:

- No manual DNA/voice entry after Bible approval.
- First episode plan uses approved entities.
- First episode preflight no longer blocks planning.

## Phase 4: Approval State Machine + Bypass Closure

Goal: Director and direct commands obey the same server-side gates.

States:

```text
BIBLE_DRAFT
BIBLE_APPROVED
EPISODE_DRAFT
EPISODE_APPROVED
PRODUCING
QC
PUBLISH_READY
```

Work:

- Derive and enforce project, episode, and publish state on the server.
- Direct commands must use the same gates as Director.
- Remove Android direct bypass paths.
- Show job status, retry, and failure reason in Director.
- Publish requires QC, episode approval, and publish approval.

Acceptance:

- Production cannot start from an unapproved state.
- Direct Android commands cannot bypass gates.
- Publish is blocked until all approvals exist.

## Phase 5: Migrations, Deploy, E2E, Rollback

Goal: prove the real flow on the live stack.

Deployment order:

1. Obtain central DB DSN through the approved secret path.
2. Back up the database.
3. Apply migrations `015` through `021` with `ON_ERROR_STOP=1 -1`.
4. Add and apply any onboarding migration only if server-side onboarding
   persistence is required.
5. Deploy backend.
6. Sync EC2 checkout to the deployed SHA.
7. Build and install Android.
8. Run E2E and bypass-negative tests.
9. Run rollback drill.

Acceptance:

- Live runtime SHA matches Git and container dist.
- Migrations match the deployed runtime.
- New project goes from Director onboarding to publish-ready without manual
  character/DNA/voice entry.
- Direct bypass attempts are rejected.
- Rollback is documented and tested.

## Required Validation Cases

- Setup missing: clear blockers.
- Setup ready: Director asks project settings.
- Project is created from Director chat.
- Bible draft is created; approval persists all entities.
- Retry does not duplicate entities.
- Studio modules prefill.
- Approved Bible plans first episode.
- Production uses persisted cast and voices.
- QC and publish gates work.
- Direct-command bypasses are rejected.

## Critical Fixes

| Priority | Fix |
|---|---|
| P0 | Readiness config paths and DB health |
| P0 | Director onboarding without an existing project |
| P0 | Persist all WF-01 entities, not only `story_bible` |
| P0 | Server-side approval gates |
| P1 | Project settings capabilities |
| P1 | Studio prefill from persisted entities |
| P1 | First episode circular preflight unblock |
| P1 | WF-02/WF-03 use persisted cast/voices |
| P2 | Clean direct-command bypasses |
| P2 | Apply migrations and deploy |

## Decisions

1. Director can start before a project exists.
2. Project settings live in project metadata; creative content lives in Bible.
3. Bible is draft-first and persists only after approval.
4. Production approval is staged: episode/script, media, then publish.
5. Quick-create remains a secondary path; Director onboarding is primary.
6. Initial projectless chat may be stateless to avoid a migration; add
   server-side onboarding persistence only if cross-device history is required.

## Implementation Order

1. Baseline freeze.
2. Projectless Director chat.
3. Bible draft/apply and entity persistence.
4. WF-02/WF-03 cast/voice consumption.
5. Studio prefill and first-episode planning.
6. Production state machine and server gates.
7. Migrations, deploy, E2E, rollback.

## Change Discipline

- One phase per commit.
- Tests after every phase.
- No unrelated feature work until the Director E2E is green.
- No production migration or deploy without explicit approval for that step.
- Record evidence in the system ledger and session handoff.
