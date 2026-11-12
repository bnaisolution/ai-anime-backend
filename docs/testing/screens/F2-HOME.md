# SCREEN SIGN-OFF — Home Dashboard (F2.1)

Screen: bottom bar → **Home** · Route: `studio`
Status: **IN REVIEW** · Reviewed on: 2026-11-12 · Reviewer: user (manual) + backend evidence (agent)

## A. Design / UI checklist (user fills Pass-Fail)

| # | Check | Kaise dekho | Expected | Result |
|---|---|---|---|---|
| A1 | Top bar alignment | Hamburger, "AI Studio", right badge | teeno ek line me, badge edge se 16dp door | |
| A2 | Health dot | Title ke aage green dot | matlab clear ho (tooltip/label) | |
| A3 | Provider badge | "KAGGLE AUTO" | tap karne par kuch ho ya clearly non-tappable lage | |
| A4 | Card grid | Production State + Pending Approvals | dono equal width, same height, 12dp gap | |
| A5 | Card text hierarchy | Title vs subtitle vs status | 3 levels clear, status sabse bold | |
| A6 | Status chip contrast | "Completed", "ACTIVE" | text bg par saaf padhe (WCAG AA) | |
| A7 | Recent Episodes card | thumb/status/time | ek row me wrap na ho, ellipsis ho | |
| A8 | Section headers | "Recent Episodes", "Projects (3)" | same typography, refresh icon right align | |
| A9 | Project card selected state | border + green check | aur clearly dikhe ki selected kaunsa hai | |
| A10 | FAB | "+ Create Project" | bottom nav ko overlap na kare, thumb reach me | |
| A11 | Bottom nav | 5 tabs | icons + labels center aligned, active state clear | |
| A12 | Scroll | list lambi karo | content bottom nav ke neeche na chhupe | |
| A13 | Dark mode (agar support) | system dark | text/chips readable | |
| A14 | Small screen / font scale | font size bada karo | text cut/overlap na ho | |

## B. Data correctness (backend evidence attached)

| # | Check | Expected | Result |
|---|---|---|---|
| B1 | Projects count | header count = list length = DB count | |
| B2 | Project name | DB `name` jaisa hi | |
| B3 | Season / Episode line | DB `season_number` / `current_episode` se aaye, hardcoded na ho | |
| B4 | Status chip | har project ka apna status; ek se zyada ACTIVE na ho | |
| B5 | Recent Episodes | latest episode + sahi project + sahi relative time | |
| B6 | Episode title | duplicate prefix nahi, truncation par "…" | |
| B7 | Episode status | human readable (e.g. "Scene plan ready") | |
| B8 | Pending Approvals | actual pending count se match | |
| B9 | Production State | kis project ka hai — context dikhe | |

## C. Buttons / actions

| # | Action | Expected | Result |
|---|---|---|---|
| C1 | Project card tap | wahi project select ho, detail khule, selection persist | |
| C2 | Refresh icon | loading indicator → data refresh, error par message | |
| C3 | "+ Create Project" | form khule | |
| C4 | Create (empty title) | inline validation, crash nahi | |
| C5 | Create (valid) | project bane + list me top par aaye | |
| C6 | Production State card tap | "Tap for details" ke hisaab se detail khule | |
| C7 | Pending Approvals card tap | Review & Approvals khule | |
| C8 | Recent Episodes card tap | episode khule | |
| C9 | Bottom nav 5 tabs | har tab sahi screen khole, back stack theek | |
| C10 | Hamburger | drawer khule, sections collapse/expand ho | |

## D. States

| # | State | Expected | Result |
|---|---|---|---|
| D1 | Loading | skeleton/spinner, layout jump nahi | |
| D2 | Error (backend down) | retry button wala error card | |
| D3 | Empty (0 projects) | empty state + CTA | |
| D4 | Offline | clear message, crash nahi | |

## E. Backend evidence (agent)

- `GET /v1/anime/projects` → **200**, 3 items
- Sabhi 3 projects: `is_active = true`, `season_number = null`, `current_episode` = 1 / **0** / 1
- "Cursed Samurai": `current_episode = 0` → UI par "Episode 0"
- `Season 1` UI me hardcoded lag raha hai (DB me season null)

## Findings (from screenshot + API)

| ID | Sev | Finding |
|---|---|---|
| B-01 | P2 | Multiple projects `ACTIVE` ek saath; selected project header me visible nahi |
| B-02 | P2 | "Cursed Samurai" Episode 0 + Recent me "Ep 1" — contradiction |
| B-03 | P2 | Recent episode title "Episode 1: Shadows of" — duplicate prefix + bina "…" cut |
| B-04 | P3 | Raw enum `SCENE_PLAN_READY` user ko dikh raha |
| B-05 | P3 | Production State "Completed" — kis project ka, context nahi |
| B-06 | P3 | "Season 1" hardcoded (DB season null) |
| B-07 | P2 | Test data ("testing 101") production list me |
| B-08 | P3 | "KAGGLE AUTO" badge ka function unclear |
| B-09 | P3 | Status chip contrast kam (light green on lavender) |
