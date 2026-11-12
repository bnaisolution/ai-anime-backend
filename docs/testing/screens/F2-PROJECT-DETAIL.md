# SCREEN SIGN-OFF — Active Project / Project Detail (F2.2)

Route: `project_detail` · Entry: bottom bar **Projects**, Home project card, drawer **Active Project**
Status: **READY FOR TEST** · Date: 2026-11-12

## A. Design / UI

| # | Check | Expected | Result |
|---|---|---|---|
| A1 | Cover banner | 150dp, image ya gradient placeholder, text cut nahi | |
| A2 | Header | project name + subtitle (Medium • Genre • Policy) ek line me | |
| A3 | Edit icon | header ke right me, tap target 48dp | |
| A4 | 2 status cards | Canon Status + Continuity Check equal width | |
| A5 | 3 metric cards | Episodes / Scenes / Characters equal width | |
| A6 | 3 metric cards (row 2) | Active Jobs / Pending Approvals / Queued Actions | |
| A7 | Back arrow | top-left me back arrow (Home par hamburger) | |
| A8 | Scroll | last card bottom nav ke neeche na chhupe | |

## B. Data (backend: `GET /v1/anime/projects/{id}/overview`)

| # | Check | Expected | Result |
|---|---|---|---|
| B1 | Project name | DB `projects.name` ke barabar | |
| B2 | Medium / Genre | DB `visual_medium` / `genre` | |
| B3 | Policy text | DB `auto_approve` ke hisaab se Auto-Approve / Review Gate | |
| B4 | Episodes count | DB episodes count | |
| B5 | Scenes count | DB scenes count | |
| B6 | Characters count | DB characters count | |
| B7 | Canon status | `UNSET` na dikhe jab data ho | |
| B8 | Continuity status | `UNCHECKED` na dikhe jab check chala ho | |

## C. Buttons

| # | Action | Expected | Result |
|---|---|---|---|
| C1 | Edit (pencil) | Project Settings dialog khule | |
| C2 | Settings → title badal → Save | 200, dialog band, naya title turant | |
| C3 | Settings → Genre / Medium badal → Save | save ho, reload par bana rahe | |
| C4 | Settings → Cover URL daal → Save | banner me image load | |
| C5 | Auto-Approve switch → Save → screen chhod kar wapas | state persist | |
| C6 | Settings → Cancel | kuch save na ho | |
| C7 | Canon Status card | Canon & Facts screen khule | |
| C8 | Continuity Check card | Continuity Checker khule | |
| C9 | Episodes / Scenes / Characters metric | respective screen khule | |
| C10 | Active Jobs / Queued Actions | Jobs Monitor khule | |
| C11 | Pending Approvals | Review & Approvals khule | |
| C12 | Top project selector | doosra project select → data badle | |
| C13 | Refresh icon (selector bar) | data reload | |

## D. States

| # | State | Expected | Result |
|---|---|---|---|
| D1 | Loading | spinner, koi jump nahi | |
| D2 | Error | "Error Loading Project" + Retry kaam kare | |
| D3 | No project selected | clear message, crash nahi | |

## Backend evidence (agent bharega)

- `GET /v1/anime/projects/{id}/overview` → ___
- `PATCH /v1/anime/projects/{id}` → ___ (settings save)
- DB row after save → ___
