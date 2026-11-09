# n8n Runtime Test Report

Date: 2026-11-09
Status: **STATIC VALIDATION PASSED — RUNTIME BLOCKED**

## Summary

| Item | Result |
|---|---|
| Canonical workflow files | 14/14 present |
| Unique workflow IDs | PASS |
| Node/connection integrity | PASS |
| Main webhook path | `api/v1/router` PASS |
| WF-13 schedule + executeWorkflow triggers | PASS |
| Obvious committed credentials | none found |
| Intent → workflow map | PASS |
| Live import/activation | NOT PERFORMED |
| Webhook execution | NOT PERFORMED |
| Sub-workflow execution | NOT PERFORMED |
| Callback delivery | NOT PERFORMED |
| Error/retry behavior | NOT PERFORMED |

## Canonical workflows

| Workflow | ID | Nodes |
|---|---|---:|
| `StoryWF-00_Main_Router.json` | `U4pLz7pXmG2OqXlt` | 34 |
| `StoryWF-01.json` | `UeEXeimGGwqIh84T` | 33 |
| `storywf02.json` | `qRUdhg1PNDK2wJk6` | 25 |
| `storywf03.json` | `s4RGuFSDlevgD5nC` | 38 |
| `storywf04.json` | `8q9tF3VE0mLUZQfa` | 30 |
| `storywf05.json` | `ADPseu4KBfVveYrq` | 16 |
| `storywf06.json` | `WAB7tCTJSUilOp07` | 17 |
| `Storywf07.json` | `zvw63UrbObZhFUiW` | 27 |
| `Storywf08.json` | `MrWrz58aRUVTzpLr` | 22 |
| `storywf09.json` | `gT1c0Hpvrwyf9YS6` | 14 |
| `StoryWf10.json` | `swOEbQV3iNUNmMwu` | 14 |
| `Storywf11.json` | `baRqhI9JSob9m5oD` | 15 |
| `StoryWf12.json` | `2fcuca0HkGxGIYMv` | 8 |
| `storywf13.json` | `jI39p4vr4CnWhpgw` | 13 |

## Static findings that still block acceptance

- No workflow contains a backend callback, `stopAndError`, or `errorWorkflow` node.
- WF-00 uses synchronous `executeWorkflow` calls behind the backend's 45-second dispatch timeout.
- WF-02 builds a WF-03 payload but does not invoke WF-03.
- Backend callback routes and HMAC verification are therefore not proven in the real pipeline.
- Commands can remain in `DISPATCHED` / `RECONCILING` without a terminal callback.

## Runtime blockers

- No disposable n8n instance.
- No approved n8n API key or webhook access.
- No isolated database for workflow writes.
- No live GPU/CPU worker endpoints.
- Runtime changes require explicit Owner approval; none was granted for live workflow activation.

## Decision

n8n static inventory and structural validation are **TESTED AND PASSED**. Runtime execution is **BLOCKED**. Do not claim end-to-end workflow completion.

## Evidence

- `ai-anime-backend/n8n-workflows/`
- `ai-anime-backend/test/static/workflows.contract.test.js`
- `reports/android-testing/evidence/n8n-static-2026-11-09/`
- `docs/testing/WORKFLOW_TEST_REPORT.md`
