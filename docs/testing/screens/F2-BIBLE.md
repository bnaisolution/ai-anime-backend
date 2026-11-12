# SCREEN SIGN-OFF — Story Bible (F2.3)

Route: `bible` · Entry: drawer **STORY → Story Bible**, Project Detail se
Status: **READY FOR TEST** · Date: 2026-11-12

## A. Design / UI

| # | Check | Expected | Result |
|---|---|---|---|
| A1 | Sections count | 6-7 section: Premise, Tone & Genre, World Setting, World Rules, Power System, Core Cast, Timeline | |
| A2 | Section headings | ek jaise typography, ek doosre se clear gap | |
| A3 | Text fields | multi-line, lamba text scroll ho, cut na ho | |
| A4 | Save button | hamesha reachable (sticky ya top), disabled jab kuch na badla | |
| A5 | Unsaved indicator | text badalne par save enable / warning | |
| A6 | AI Expand Bible button | primary action jaisa dikhe, loading state ho | |
| A7 | Back arrow | top-left me back arrow | |

## B. Data

| # | Check | Expected | Result |
|---|---|---|---|
| B1 | Premise | DB `story_bible.premise` | |
| B2 | Tone & Genre | DB `story_bible.genre` | |
| B3 | World Setting | DB `story_bible.world_setting` | |
| B4 | Power System | DB `story_bible.power_system` | |
| B5 | Timeline | DB `story_bible.timeline` ya `season_arc` | |
| B6 | Core Cast | DB `story_bible.character_foundations` | |
| B7 | Empty bible | blank fields, crash nahi | |

## C. Buttons

| # | Action | Expected | Result |
|---|---|---|---|
| C1 | Text likho → Save | 200, toast, wapas aane par text bana rahe | |
| C2 | Save ke bina back dabao | "discard changes?" dialog | |
| C3 | Discard confirm | changes chale jayein, screen band | |
| C4 | AI Expand Bible | loading → content generate / clear error | |
| C5 | AI Expand ke baad Save | generated content save ho | |
| C6 | Bible prompt selector (agar dikhe) | select karne par save me persist | |

## D. States

| # | State | Expected | Result |
|---|---|---|---|
| D1 | Loading | spinner | |
| D2 | Error | message + retry | |
| D3 | Save fail (backend down) | toast error, text loss nahi | |

## Backend evidence (agent bharega)

- `GET /v1/anime/projects/{id}/bible` → ___
- `PATCH /v1/anime/projects/{id}/bible` → ___
- AI expand command (`wf01_bible_gen`) → ___
