# PENDING CHANGES — Screen 1 (Home) + Screen 2 (Active Project)

Source: user runtime test on APK `59e6f92` (2026-11-12). Status: **Screen 1/2 fixes implemented in `opencode/ui-runtime-fixes`; device verification pending.**

## Screen 1 — Home

| ID | Type | Request | Status |
|---|---|---|---|
| C-01 | change | Drawer sections ko wapas **dropdown/collapse** banao (header par arrow, tap se khule/band). Default: sab open. | FIXED (commit `5f0088a`, device verify pending) |
| C-02 | bug | Drawer header me user email ke bagal wala **role chip (`owner admin`) tap par kuch nahi karta** → Owner Overview khule. | FIXED (commit `5f0088a`, verify pending) |
| C-03 | change | Health indicator label: `Online/Offline` → `Backend Online/Offline` (user ne meaning pucha). | FIXED (commit `5f0088a`, verify pending) |
| C-04 | change | Production State card jab `Failed` ho to andar **"View failed job →"** link (Jobs Monitor). | FIXED (commit `5f0088a`, verify pending) |

## Screen 2 — Active Project (Project Detail)

| ID | Type | Request | Status |
|---|---|---|---|
| C-05 | bug (P1) | **Canon Status, Continuity Check, Scenes, Active Jobs, Queued metrics, 10 Studio Module tiles** tap par kuch nahi hota. Root cause: `AppNavGraph.kt` me `composable("project_detail")` sirf 6 callbacks wire karta hai, baaki default `{}`. | FIXED (commit `5f0088a` — wiring added, device verify pending) |
| C-06 | feature | Cover banner tap → **image upload / change** option (backend: `assets/upload-sessions`, `storage/upload` already exists). URL field bhi rahe. | DONE (branch `opencode/ui-runtime-fixes` — picker + `/v1/anime/storage/upload`; device verify pending) |
| C-07 | feature | **Genre** ko free-text se **multi-select chips** banao (built-in 5-10: Action, Thriller, Horror, Comedy, Dark Fantasy, Sci-Fi...). Multiple select ho. Last option **"+ Add more genre"** → Prompt Studio (BIBLE/GENRE category). | DONE (commit `5f0088a`) |
| C-08 | feature | **Visual Medium** single-select (ANIME / MANHWA / 3D / ...), multi-select nahi. **"+ Add more"** → Prompt Studio (visual medium prompts). | DONE (commit `5f0088a`) |
| C-09 | change | **Save Settings** tab tak disabled jab tak koi field change na ho (dirty check). | DONE (commit `5f0088a`) |
| C-10 | change | "Generate Next Episode" label **dynamic** → `Create Episode N`. | DONE (commit `5f0088a`) |
| C-11 | feature (P1) | Generate button **readiness ke bina clickable na ho**. Preflight check: Story Bible complete? characters? scene plan? DB live? GPU/CPU worker? Telegram? | DONE (branch `opencode/ui-runtime-fixes` — readiness gate; device verify pending) |
| C-12 | feature | `READY` badge clickable → **readiness / pending list screen**. Ready = green, pending = amber. | DONE (branch `opencode/ui-runtime-fixes`; device verify pending) |
| C-13 | feature | Naya **Preflight / Pending Work screen**: pending items ki list + har item par **"Generate with AI"** (one-click) + dedicated screen ka deep link. | DONE (branch `opencode/ui-runtime-fixes` — `PreflightScreen`; device verify pending) |
| C-14 | change | **Episode Production Control** Studio Modules ke **sabse neeche** (last section) ho. | DONE (branch `opencode/ui-runtime-fixes`; device verify pending) |
| C-15 | feature | Project me **episode count + per-episode duration + script word count** set karne ka option (DB `episodes.word_count` already exists). Bible + AI script isi ke hisaab se generate ho. | OPEN |

## Verified good on Screen 2
Banner text, name/subtitle, 2+3+3 card layout, project selector + refresh, spinner, counts (Episodes 1 / Scenes 0 / Characters 0), Canon `UNSET`, Continuity `UNCHECKED`, Reviews tile, Episodes tile, Characters tile, Analytics tile, back nav, no errors.
