# Report B — WF-03 Root Cause

Workflow: `storywf03` (id s4RGuFSDlevgD5nC), active, 38 nodes.

Root causes identified:
1. `$node.name` in callback_id expressions resolves via n8n v2 DataProxy node-name lookup and can throw "Referenced node doesn't exist". Fix per learnings: use static literal (`'Backend: Success Callback'` / `'Backend: Error Callback'` or `'WF-03'`).
2. GPU tunnel staleness: WF-03 fetches latest `kaggle_sessions` row and uses `primary_gpu_url`/`api_endpoint`. Session `kaggle_story_engine` status active but updated 2026-09-30; endpoint may be dead trycloudflare URL. Needs tunnel refresh or backend infra update.
3. WF-02→WF-03 chaining exists (executeWorkflowTrigger present) but runtime not verified.
4. Callback auth uses `ANIME_WORKFLOW_GATEWAY_TOKEN` and backend callback endpoint; contract needs verification.

Proposed fix (not applied): replace `$node.name` with static literals; refresh GPU session endpoint; verify callback contract; test with controlled episode.

No modification performed.
EOF