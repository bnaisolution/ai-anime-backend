# Android All Screens and Buttons Test Report

Date: 2026-11-09
Status: **TESTED AND PASSED — AUTOMATED SCOPE**

## Final evidence

| Item | Result |
|---|---|
| Tested commit | `44bfa15c5e23d09e51a2d3c681c9cca3b219f844` |
| CI run | `42577400016` — https://github.com/bnaisolution/ai-anime-android/actions/runs/42577400016 |
| Workflow conclusion | `success` |
| JVM unit tests | 20/20 PASS |
| Instrumentation tests | 116/116 PASS |
| Control-level suite | 35/35 PASS |
| Maestro flows | 2/2 COMPLETED |
| Android lint | 25 findings: 14 warning, 11 information, 0 errors |
| APK / test APK | Built |

## Coverage

| Item | Count |
|---|---:|
| Screen files | 33 |
| Navigation routes | 35 |
| Tabs | 14 |
| Interactive controls | 205 |
| Control-label occurrences asserted/clicked | 280 |
| Screens with screen-root test tags | 33/33 |

The 35-method `Batch2FullControlCoverageTest` suite covers all 33 screens and asserts or clicks 280 control-label occurrences. It does not claim one-to-one 205/205 control assertions because a control can expose multiple labels or states. The label-to-test map is in `reports/android-testing/evidence/android-control-expansion-2026-11-09/CONTROL_ASSERTION_MAP.md`.

## Per-screen result

| Screen | Route(s) | Result |
|---|---|---|
| `AdminQueuesScreen` | `admin_queues` | PASS |
| `AIBrainScreen` | `ai_brain` | PASS |
| `AnalyticsScreen` | `analytics` | PASS |
| `AuditLogScreen` | `audit_log` | PASS |
| `AuthScreen` | `auth` | PASS |
| `BibleScreen` | `bible` | PASS |
| `BudgetLedgerScreen` | `budget_ledger` | PASS |
| `CanonViewerScreen` | `canon` | PASS |
| `CharacterDeepDiveScreen` | `character_deep_dive` | PASS |
| `CharacterDetailScreen` | `character_detail` | PASS |
| `CharacterListScreen` | `characters` | PASS |
| `ContinuityCheckerScreen` | `continuity` | PASS |
| `DatabaseScreen` | `database` | PASS |
| `EpisodePlannerScreen` | `episodes` | PASS |
| `JobsMonitorScreen` | `jobs_monitor` | PASS |
| `LoreExplorerScreen` | `lore_explorer` | PASS |
| `MediaLibraryScreen` | `media_library` | PASS |
| `NotificationScreen` | `notifications` | PASS |
| `OwnerOverviewScreen` | `owner_overview` | PASS |
| `ProductionScreen` | `production`, `production/{cmdId}` | PASS |
| `ProjectDetailScreen` | `project_detail` | PASS |
| `PromptStudioScreen` | `prompt_studio` | PASS (UI only; persistence defects remain) |
| `PublishScreen` | `publish` | PASS |
| `QCScreen` | `qc` | PASS |
| `QuickToolsScreen` | `quick_tools` | PASS |
| `QuotaDashboardScreen` | `quota_dashboard` | PASS |
| `ReviewInboxScreen` | `review_inbox` | PASS |
| `SceneDetailScreen` | `scenes`, `scenes/{epNo}` | PASS |
| `SettingsScreen` | `settings` | PASS |
| `StudioDashboardScreen` | `studio` | PASS |
| `VisionAnalysisScreen` | `vision_analysis` | PASS |
| `WorkerManagerScreen` | `workers` | PASS |
| `WorkflowManagerScreen` | `workflows` | PASS |

## Test environment

- Runner: GitHub Actions Ubuntu x86_64.
- Emulator: API 34 Google APIs.
- No local Termux/ARM64 Android execution was used.
- Maestro flows: `01-launch`, `02-auth-validation`.

## Limitations

- Tests use fake repositories for most screens; live backend persistence is not proven.
- Manual accessibility, physical-device, and tablet/rail checks were NOT PERFORMED.
- Prompt Studio UI tests pass, but backend prompt-category and project-default defects remain.
- Backend side effects per control are not proven.

## Evidence

- `reports/android-testing/ANDROID_4_BATCH_FINAL_ACCEPTANCE.md`
- `reports/android-testing/evidence/ci-42577400016/`
- `docs/audit/ANDROID_BATCH_2_CONTROL_COVERAGE.md`
- `docs/audit/ANDROID_BATCH_2_SCREEN_COVERAGE.md`
- `docs/audit/ANDROID_BATCH_2_NAVIGATION_COVERAGE.md`
