# Batch 1 n8n Reliability Report

Date: 2026-11-09
Status: **BACKEND RELIABILITY CODE ADDED — RUNTIME BLOCKED**

## Completed in backend

- Callback requests verify that the callback `command_id` belongs to the callback `project_id`.
- Invalid bindings are rejected before callback persistence.
- Valid callbacks enqueue a `reconcile_command` outbox event.
- Outbox insertion failure deletes the callback inbox row to prevent a false duplicate on retry.
- `SupervisorWorker` already consumes `reconcile_command`; this path is now fed only by verified bindings.
- Stale `processing` outbox events are recovered and re-queued.
- Terminal command states are immutable during reconciliation.
- Stale `RECONCILING` commands escalate to `MANUAL_REVIEW` instead of looping.
- Pending actions are matched through `job_id`.

## Workflow files

No canonical `WF-00`–`WF-13` workflow JSON was modified. No workflow was imported, activated, or executed.

## Blocked evidence

| Item | Status | Reason |
|---|---|---|
| Disposable n8n runtime | BLOCKED | No isolated n8n environment |
| Signed callback replay against n8n | BLOCKED | No runtime |
| Error-path workflow validation | BLOCKED | No runtime |
| Exact before/after workflow JSON and SHA-256 | NOT APPLICABLE | No workflow file changed |
| Production import or activation | NOT AUTHORIZED | Prohibited |

## Decision

Backend callback reliability is implemented but **NOT TESTED** against n8n. Do not claim workflow runtime reliability.
