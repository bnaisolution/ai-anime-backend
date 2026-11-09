# Batch 1 n8n Reliability Report

Date: 2026-11-09
Status: **BACKEND RELIABILITY HARDENED — WORKFLOW/RUNTIME BLOCKED**

## Completed in backend

- Callback requests verify that the callback `command_id` belongs to the callback `project_id`.
- Invalid bindings are rejected before callback persistence.
- Valid callbacks enqueue a `reconcile_command` outbox event.
- Outbox insertion failure deletes the callback inbox row to prevent a false duplicate on retry.
- `SupervisorWorker` already consumes `reconcile_command`; this path is now fed only by verified bindings.
- Stale `processing` outbox events are recovered and re-queued.
- Processing rows with a `NULL` lease timestamp are also recovered.
- Terminal command states are immutable during reconciliation.
- Stale `RECONCILING` commands escalate to `MANUAL_REVIEW` instead of looping.
- Pending actions are matched through `job_id`.

## Workflow files

All 14 canonical `WF-00`–`WF-13` workflow JSON files were audited. No workflow contains a backend callback node, `stopAndError`, or `errorWorkflow` configuration. Several nodes use `continueOnFail`, but that is not callback, terminal-error, or reconciliation handling.

No canonical `WF-00`–`WF-13` workflow JSON was modified. No workflow was imported, activated, or executed. Workflow-side `B1-06` remains **BLOCKED** because no specific workflow change was approved and no disposable runtime is available.

## Blocked evidence

| Item | Status | Reason |
|---|---|---|
| Disposable n8n runtime | BLOCKED | No isolated n8n environment |
| Signed callback replay against n8n | BLOCKED | No runtime |
| Error-path workflow validation | BLOCKED | No runtime |
| Workflow callback/error node changes | BLOCKED | No specific workflow approval; existing workflows must remain byte-identical |
| Exact before/after workflow JSON and SHA-256 | NOT APPLICABLE | No workflow file changed |
| Production import or activation | NOT AUTHORIZED | Prohibited |

## Decision

Backend callback reliability is implemented but **NOT TESTED** against n8n. Do not claim workflow runtime reliability.
