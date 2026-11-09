# Prompt Studio Full Test Report

Date: 2026-11-09
Status: **PARTIALLY IMPLEMENTED / BROKEN — RUNTIME E2E BLOCKED**

## Summary

| Area | Status | Evidence |
|---|---|---|
| Android Prompt Studio UI | TESTED AND PASSED (UI) | 116/116 instrumentation, 35/35 control suite |
| Category tabs and edit/reset controls | TESTED AND PASSED (UI) | Cloud run `42577400016` |
| Prompt list/load with project scope | PARTIALLY IMPLEMENTED | Backend GET filters `user_id`; project optional |
| Prompt create endpoint | PARTIALLY IMPLEMENTED / BROKEN | `CreatePromptBody` omits `prompt_category`; handler does not persist it |
| Prompt update endpoint | MISSING | No update route; Android uses create |
| Prompt category persistence | BROKEN | Backend insert drops category |
| Project default mutation on save | BROKEN | `set_active` updates `projects.visual_medium` and `active_system_prompt_id` |
| Android save medium | BROKEN | `PromptStudioScreen` hardcodes `visualMedium = "ANIME"` |
| Cross-tenant prompt injection | BROKEN | Global pre-validation query has no `user_id` filter |
| Cross-project prompt fallback | PARTIALLY IMPLEMENTED | Active-prompt lookup does not include `user_id` |
| Genre templates | NOT IMPLEMENTED | No prebuilt genre template set |
| Search / filters / favorites | NOT IMPLEMENTED | No source surface |
| Versioning | NOT IMPLEMENTED | No working version table/route |
| Compatibility validation | NOT IMPLEMENTED | Only `ANIME` / `REAL_HUMAN` medium switch |
| IMAGE prompt → image generation | PARTIALLY IMPLEMENTED | Category matching exists; end-to-end dispatch not proven |
| Episode dispatch → WF-03 | NOT IMPLEMENTED | WF-02 does not call WF-03 |
| Runtime persistence | BLOCKED | Login is `503`; no isolated test DB/n8n |

## Verified defects

1. `CreatePromptBody` contains `project_id`, `title`, `visual_medium`, `prompt_text`, and `set_active`; it has no `prompt_category`. The handler inserts only the listed fields, so category is not persisted.
2. Saving with `set_active` updates `projects.visual_medium` and `projects.active_system_prompt_id`, overwriting project defaults.
3. Android `PromptStudioScreen` calls `saveSystemPrompt(..., visualMedium = "ANIME", ...)`, ignoring the selected project medium.
4. `modules/anime/index.ts` pre-validation loads prompts with `.or(project_id.eq..., project_id.is.null)` and no `user_id` filter.
5. `commands.service.ts` active-prompt lookup filters by prompt id but not `user_id`.
6. No update route exists; edits create new rows.
7. No search, favorites, versioning, genre templates, or compatibility validation exists.

## What passed

- Android Prompt Studio screen, category tabs, edit, save, reset, and validation controls passed in the fake-repository instrumentation suite.
- Backend prompt GET and project-scoped prompt routes require authentication and enforce project ownership in route tests.
- Prompt delete is scoped to `user_id`.

These passes do not prove real prompt persistence or tenant isolation.

## Blockers

- No working password login; clean-install authenticated prompt calls return `401`.
- No isolated Supabase test project.
- No disposable n8n runtime for IMAGE/WF-03 verification.
- No live Android → backend → database prompt round-trip.

## Decision

Prompt Studio is not accepted. UI automation passes, but category persistence, project-default safety, tenant isolation, and real E2E remain broken or unverified.

## Evidence

- `PROMPT_STUDIO_AUDIT_2026-11-07.md` (preserved historical audit)
- `ai-anime-backend/src/modules/anime/infrastructure/infrastructure.routes.ts`
- `ai-anime-backend/src/modules/anime/index.ts`
- `ai-anime-backend/src/modules/anime/commands/commands.service.ts`
- `ai-anime-android/app/src/main/java/org/dpdns/bnai/anime/ui/studio/PromptStudioScreen.kt`
- `ai-anime-android/app/src/main/java/org/dpdns/bnai/anime/ui/studio/PromptStudioViewModel.kt`
- `reports/android-testing/evidence/ci-42577400016/`
