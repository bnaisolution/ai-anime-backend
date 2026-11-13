# SESSION HANDOFF — AI Anime Engine (Ongoing)

## Date / Run
2026-11-13, post-Phase A skip. User instructed: complete Phases B→D, skip Phase A.

## Where the work stands
- Android: Phases A/B/C/D pending execution; APK `b0c350f` / run `43368507933` / artifact `anime-debug-apk` (green).
- Backend: CI fixed + pushed (`0bb38e5`), `Backend Tests` green (run `43412070136`).
- n8n: WF-03 failing — root cause = stale/dead GPU tunnel (`...trycloudflare.com`) + broken `$node.name` expression in error/success callbacks.

## Code fixes required next (n8n workflows, backend repo)
1. `Backend: Success/Error Callback` nodes: `$execution.id + ':completed:' + $node.name` → static-safe literal (n8n v1 `$node` proxy cannot resolve node named `name`). Same for `:failed:`.
2. WF-01 LLM nodes: `$node.name.includes('Gemini') ? ... : ...` → static per-node model (`GROQ_MODEL` / `GEMINI_MODEL`).
3. Live n8n: PUT updated workflows to IDs `s4RGuFSDlevgD5nC` (WF-03) + registry IDs via n8n API key.
4. Rebuild backend not required for n8n JSON fix; backend deploy + restart required for backend-side changes.

## Owner-blocked (await user)
- GPU runtime worker, Telegram bot/channel, DB migration apply go-ahead, release keystore, OD-14 acceptance.

## Protocol reminders
- Never run gradle/JVM tests locally; delegate to GH Actions.
- Ledger: `docs/architecture/06_SYSTEM_LEDGER.md` (compact, <50 lines).
- Learnings: `docs/architecture/07_AGENT_LEARNINGS.md` (add new trap #17 if found).
- Next AI: read AGENTS.md → ledger → learnings → this file → then fix above.
