# BUG LIST — Anime Engine (living document)

Legend — Severity: **P0** app unusable / data loss · **P1** core feature broken · **P2** minor break / workaround exists · **P3** cosmetic
Status: `OPEN` → `FIXING` → `FIXED (verify pending)` → `CLOSED`

| ID | Feature | Sev | Screen / Button | Steps | Expected | Actual | Layer | Evidence | Status |
|----|---------|-----|-----------------|-------|----------|--------|-------|----------|--------|
| B-01 | F2 Home | P2 | Project cards | Home kholo | sirf selected project hi "active" dikhe | teeno projects par `ACTIVE` | UI/data | `GET /v1/anime/projects` → all `is_active=true` | FIXED (verify pending) |
| B-02 | F2 Home | P2 | Project card subtitle | "Cursed Samurai" dekho | "Not started" (episode 0) | "Episode 0" | UI | DB `current_episode=0` | FIXED (verify pending) |
| B-03 | F2 Home | P2 | Recent Episodes title | episode card dekho | ek hi "Ep 1", overflow par "…" | "Ep 1: Episode 1: Shadows of" cut | UI | screenshot | FIXED (verify pending) |
| B-04 | F2 Home | P3 | Episode status chip | episode card dekho | "Scene plan ready" | raw `SCENE_PLAN_READY` | UI | screenshot | FIXED (verify pending) |
| B-05 | F2 Home | P3 | Production State card | card dekho | kis project ka state hai dikhe | project context missing | UI | screenshot | FIXED (verify pending) |
| B-06 | F2 Home | P3 | Season/Episode line | project card dekho | DB values se, missing ho to hide | hardcoded "Season 1" | UI | DB `current_season` | FIXED (verify pending) |
| B-07 | F2 Home | P2 | Project list | list dekho | test/demo data production me na ho | "testing 101" user data | Data | DB row | OPEN (user decision: rename/delete) |
| B-08 | F2 Home | P3 | Health dot | title ke aage dot | matlab clear ho | sirf green dot | UI | screenshot | FIXED (verify pending) |
| B-09 | F2 Home | P3 | Status chip contrast | chip dekho | WCAG AA readable | light text on light chip | UI | screenshot | OPEN (design token review) |
| B-10 | Global | P1 | Top bar | Project Detail / Bible kholo | back arrow + system back | sirf hamburger, back nahi | UI | user report | FIXED (verify pending) |
| B-11 | F2 Home | P1 | Project delete | project row par delete | confirm dialog → delete | kahin option hi nahi | Backend + UI | no route, no icon | FIXED (backend verified 200 / 403) |
| B-12 | Global | P2 | AI Director bubble | Home kholo | FAB har screen par | Home par hide | UI | `isGlobalFabVisible` | FIXED (verify pending) |
| B-13 | F2 Home | P2 | Recent Episodes | active project me 0 episodes | section + empty state | section hi gayab | UI | user report | FIXED (verify pending) |
| B-14 | Global | P0 | Drawer sections | ☰ → section header tap | items expand ho | kuch nahi hota, aage navigation block | UI | user report | FIXED (verify pending) |
| B-15 | Global | P3 | Provider badge | top bar chip | `AI: <provider>` clear label | "KAGGLE AUTO" unclear | UI | user report | FIXED (verify pending) |
| B-16 | Global | P2 | Drawer role chip | user email ke bagal `owner admin` tap | Owner Overview khule | kuch nahi hota (`onClick = {}`) | UI | `AppNavGraph.kt` header chip | FIXED (commit `5f0088a`, verify pending) |
| B-17 | F2 Project Detail | P1 | Canon/Continuity cards, Scenes/Jobs/Queued metrics, 10 Studio Module tiles | tap | respective screen khule | kuch nahi hota | UI | `composable("project_detail")` sirf 6 callbacks wire karta hai, baaki default `{}` | FIXED (commit `5f0088a`, verify pending) |
| B-18 | F2 Project Detail | P2 | Cover banner | banner tap | upload/change image | URL field only, upload nahi | UI + API | `assets/upload-sessions` backend-ready | OPEN |
| B-19 | F2 Project Detail | P2 | Project Settings | Genre/Medium fields | selectable chips (genre multi, medium single) | free-text only | UI | user report | OPEN |
| B-20 | F2 Project Detail | P3 | Save Settings | dialog kholo | change tak disabled | hamesha enabled | UI | user report | OPEN |
| B-21 | F2 Project Detail | P1 | Generate Next Episode | button | dynamic `Create Episode N`, readiness par hi enabled | static label, bina check enabled | UI + API | user report | OPEN |
| B-22 | F2 Project Detail | P2 | `READY` badge | tap | pending/readiness list | not clickable | UI + API | user report | OPEN |

## Fix batch 1 + 2 (commit `232e290` Android, `805c43a` backend)

- Drawer: collapsible headers hata diye, saare sections always expanded (Owner Control reachable).
- Back nav: Home ke alawa har screen par back arrow; login screen par top/bottom bar hidden.
- AI FAB: Home par enabled + "Create Project" FAB ke upar lift.
- Provider badge: `AI: <provider>` + sirf Home.
- Delete: `DELETE /v1/anime/projects/:id` (owner only, cascade) + trash icon + confirm dialog.
- Data: season/episode DB se, episode 0 → "Not started", `SCREAMING_SNAKE` → human text, recent title dedupe + ellipsis, empty state.

## Open defects carried from API runtime validation

| ID | Sev | Title | Notes | Status |
|----|-----|-------|-------|--------|
| D2 | P2 | Logout ke baad access token ~1h valid rehta hai | Refresh token revoke hota hai, access token stateless verify hota hai; client token locally clear karta hai | OPEN |
| D3 | P3 | Worker CI `upload-artifact` step fail (code pass) | GitHub-side flake; rerun `startup_failure` de raha hai | OPEN |
| D5 | P2 | `/api/v1/auth/me` me `workspaceId` empty (normal user) | Login response me `default-workspace` aata hai, `/me` me `""` | OPEN |
