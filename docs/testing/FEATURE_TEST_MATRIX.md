# FEATURE TEST MATRIX — Anime Engine (screen + button coverage)

**How we work:** ek feature at a time. Main checklist deta hoon → user phone par test karta hai → jo galat ho bug list me jaata hai → fix → re-verify → feature CLOSED.

Status: `NOT TESTED` · `PASS` · `FAIL (bug id)` · `BLOCKED`

Accounts: owner `admin@example.com` / `Admin@12345` · normal `testuser@example.com` / `Testuser@12345`
Test data: project `QA-2026-11-12` (production data touch nahi)

| Feature | Screen | Action / Button | Expected | Layer | Status |
|---|---|---|---|---|---|
| **F1 Auth** | AuthScreen | Email field — valid email type karo | text accept ho | UI | NOT TESTED |
| F1 | AuthScreen | Password field — type karo | masked dots dikhe | UI | NOT TESTED |
| F1 | AuthScreen | `Show` / `Hide` toggle | password show/hide ho | UI | NOT TESTED |
| F1 | AuthScreen | `Sign In to Studio` (valid) | loading → home/library screen | UI + API 200 | NOT TESTED |
| F1 | AuthScreen | `Sign In to Studio` (wrong password) | inline red error, screen par rahe | UI + API 401 | NOT TESTED |
| F1 | AuthScreen | `Sign In to Studio` (empty fields) | error, no crash | UI + API 400 | NOT TESTED |
| F1 | AuthScreen | `Create an account` | signup screen/flow khule (ya clear message) | UI | NOT TESTED |
| F1 | AuthScreen | `Forgot Password?` | reset flow/message | UI | NOT TESTED |
| F1 | AuthScreen | Back button / app minimize-restore | session bani rahe | UI | NOT TESTED |
| F1 | Session | App kill → reopen | logged-in home aaye (session persist) | UI | NOT TESTED |
| F1 | Session | Logout (drawer/settings) | login screen, token clear | UI + API | NOT TESTED |
| F1 | Session | Logout ke baad back | protected screen na khule | UI | NOT TESTED |
| F1 | RBAC | `testuser@example.com` se login | normal user home (owner options hide) | UI + API | NOT TESTED |
| F1 | RBAC | Normal user owner screen kholne ki koshish | access denied / hidden | UI + API 403 | NOT TESTED |

## Pending features (order)

| # | Feature | Screens |
|---|---|---|
| F2 | Projects | Project list, ProjectDetail, Bible, Canon |
| F3 | Story / Episodes | EpisodePlanner, Scenes |
| F4 | Studio / Prompts | StudioDashboard, PromptStudio |
| F5 | Characters | CharacterList, CharacterDetail, DeepDive |
| F6 | Media Library / Playback | MediaLibrary |
| F7 | Production | Production, SceneDetail |
| F8 | QC / Review | QC, ReviewInbox, Continuity |
| F9 | Publish | Publish |
| F10 | Analytics / Quota / Budget | Analytics, BudgetLedger, QuotaDashboard |
| F11 | Owner / Admin | OwnerOverview, AdminQueues, Workers, Workflows, Database, AuditLog |
| F12 | AI Brain / Lore / Vision | AIBrain, LoreExplorer, VisionAnalysis |
| F13 | Notifications / Settings / Tools | Notification, Settings, QuickTools |
