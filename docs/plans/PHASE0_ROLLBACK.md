# Phase 0 Safety Net — Rollback

Date: 2026-11-28
Project: `a07a7542-0409-401e-8ab0-4c3489607eeb` (Kaal Ratri: The Ninth Aarti)
Episode: S1E1, episode id `02d31718-a6e8-49d0-af36-2e29e178c35b`

## Backups

Workflow JSON and `.env` backups were created outside git:

- Local backend: `backups/phase0-2026-11-28/`
- EC2 backend: `/home/ec2-user/ai-backend/backups/phase0-2026-11-28/`

Files:
- `storywf02.json`
- `storywf03.json`
- `.env` (EC2 only, mode `600`)

`backups/` is gitignored. Do not commit backups or secrets.

## Feature flags

Phase 0 added default-off flags:

```env
S1E1_STRICT_GATES=false
STAGE2_ACT_GROUNDING=false
WF03_SINGLE_FETCH=false
GPU_CONCURRENCY_ONE=false
NARRATIVE_MEMORY=false
SHOT_LEVEL_ASSEMBLY=false
KEYFRAME_CANDIDATES=false
```

Disable a flag by setting it to `false` and restarting the affected process. n8n flags must be present in the n8n container environment before a workflow reads them.

## S1E1 integrity hold rollback

Phase 0 changed the false-success records to `MANUAL_REVIEW` and wrote audit rows with `workflow_name='S1E1_VIMAX_PHASE0'`.

To restore the pre-Phase-0 status without deleting scenes or clips:

```sql
BEGIN;
UPDATE public.api_commands
SET status = 'SUCCEEDED'
WHERE id IN (
  '32199381-232f-4b30-9501-121e41280791',
  'e5925fb0-02ff-4017-b7b7-654344b7d37c'
)
AND status = 'MANUAL_REVIEW';

UPDATE public.episodes
SET current_state = 'SCENE_PLAN_READY',
    updated_at = now()
WHERE id = '02d31718-a6e8-49d0-af36-2e29e178c35b'
  AND current_state = 'MANUAL_REVIEW';

UPDATE public.episode_states
SET current_state = 'SCENE_PLAN_READY',
    failure_reason = '',
    updated_at = now(),
    last_state_change_at = now()
WHERE id = '3e870d44-6dd6-48f7-8755-c93ff671da46'
  AND current_state = 'MANUAL_REVIEW';
COMMIT;
```

Keep the audit rows. They are the record of the integrity hold.

## Workflow rollback

Restore from the backup copies:

```bash
cp backups/phase0-2026-11-28/storywf02.json n8n-workflows/storywf02.json
cp backups/phase0-2026-11-28/storywf03.json n8n-workflows/storywf03.json
```

Then re-import the restored workflows into n8n and verify the active workflow versions.

## Fixture preservation

S1E1 is preserved as a regression fixture:

- 82 `scenes` rows for `project_id + season_no=1 + episode_no=1`
- 82 `clips` rows for `project_id + season_no=1 + episode_no=1`
- No media URLs
- `episode_id` is `NULL` on the fixture rows; fetch by `project_id + season_no + episode_no`

Do not delete these rows during remediation. They are the negative regression fixture.
