# 2026-11-23 — Wave 1: Season / Episode / Project Identity

## Goal
Verify Batch 1 (season-aware identity) against origin/main and fix only real divergences.

## Baseline
- Repos were stale; fetched origin/main: backend `1104d74`, Android `527056e`, CPU `4e89548`.
- Created branch `remediation/2026-11-23` in all three repos from origin/main.
- Preserved prior local work: backend stash + patch, CPU branch `backup/local-ad8c815`.

## Verified present (no rewrite)
- Migration `007_season_episode_identity.sql`: `season_no` columns, old unique constraints/indexes dropped, season-aware unique constraints + indexes.
- Backend command schema/service carries `season_no`; `commands.service.ts` scopes episode lookups by project+season+episode.
- WF-02 writes `episodes`, `scenes`, `clips`, `episode_states` with `on_conflict=project_id,season_no,episode_no[,scene_order]`, and stores `season_no` on every row.
- Backend episode reads filter by `project_id + season_no + episode_no`.
- Android Episode Planner sends `season_no`, `episode_title`, `episode_synopsis`; `AnimeRepository` passes season/episode in `CreateCommandRequest`.
- AI Director context/timeline queries filter by `season_no`.

## Verified divergences fixed
1. `StoryWF-00_Main_Router.json` ingest ignored season → `season_number` always 1. Now reads `season_no/season_number` from nested payload/body and exposes `season_no`, `season_number`, `episode_title`, `episode_synopsis`.
2. WF-00 classifier `extracted_params` lacked `season_no` (Layer 1, Layer 2, regex fallback) → now propagated.
3. WF-00 idempotency lock query (`episode_states`) filtered only `project_id + episode_no` → S2E1 could be blocked by S1E1. Now includes `season_no`.
4. WF-00 → WF-02 dispatch passed `season_number` from `extracted_params.season_no || 1` and dropped title/synopsis → now passes resolved season plus `episode_title`/`episode_synopsis`.
5. `Storywf11.json` QC read/write paths used `project_id + episode_no` only (GET, PENDING_HUMAN_APPROVAL, REJECTED, APPROVED, `episode_states` QC_APPROVED) → all five now filter `season_no`.

## Tests
- Added static tests: WF-11 season-aware URLs; WF-00 season/title/synopsis propagation; WF-00 season-aware idempotency lock.
- Backend (docker `anime-backend:runtime-1104d74`): unit 210/210, static 160/160, routes 110/110 (with `ANIME_BYOD_*` forced false to match CI env).
- Runtime S1E1/S2E1/S3E1 DB proof: UNVERIFIED (no authenticated E2E project / no live DML allowed).

## Files changed
- `n8n-workflows/StoryWF-00_Main_Router.json`
- `n8n-workflows/Storywf11.json`
- `test/static/workflows.contract.test.js`

## Blockers / notes
- Live n8n still runs the old WF-00/WF-11 payloads; syncing needs explicit approval.
- `n8n-workflows-all/` mirror is stale (drift); not modified.
- Local `node_modules` was missing `pg`; installed `--no-save` inside container for test runs.

## Next
Wave 2 — verify canonical 1–30 minute contract, derived budgets, act-batched WF-02, WF-03 duration gate.
