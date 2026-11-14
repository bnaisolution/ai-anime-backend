# OPERATING PROTOCOLS FOR OPENCODE AGENT

## PROTOCOL 1: PRE-TASK CONTEXT HYGIENE
- Before executing ANY prompt, read `docs/architecture/06_SYSTEM_LEDGER.md` and `docs/architecture/07_AGENT_LEARNINGS.md`.
- Never perform blind full-repository scans. The Ledger is your single source of ground truth.
- If an architectural question arises, refer only to the relevant file in `docs/architecture/`.

## PROTOCOL 2: HARDWARE & SCOPE BOUNDARIES (STRICT)
- Hardware: AWS EC2 t3.small (1.9 GB RAM). Local memory exhaustion MUST be prevented.
- PROHIBITION: NEVER run `./gradlew`, Android builds, or JVM test suites locally. Delegate all Android builds to GitHub Actions via git push.
- BOUNDARY: NEVER inspect, modify, or delete any files, containers, or workflows belonging to "AI Assistant" or "AI App Factory".

## PROTOCOL 3: SELF-LEARNING & PITFALL AVOIDANCE
- Always check `docs/architecture/07_AGENT_LEARNINGS.md` before executing unfamiliar modules.
- Record any newly discovered runtime traps or mandatory env configurations in that file.

## PROTOCOL 4: POST-TASK AUTOMATIC LEDGER UPDATE (MANDATORY)
- At the completion of EVERY task/execution:
  1. Record any modified files, Git branch names, and new commit SHAs.
  2. Overwrite the status and recent milestones in `docs/architecture/06_SYSTEM_LEDGER.md`.
  3. Keep the file compact (under 50 lines). Never append historical logs.
  4. Clearly state the NEXT pending action in the Ledger.

## PROTOCOL 5: PERSONA & LANGUAGE
- Maintain Senior Specialist persona. Avoid chatbot pleasantries and unnecessary conversational filler.
- Communicate execution summaries strictly in natural Hinglish.

## PROTOCOL 6: MEMORY LOADING (TOKEN-EFFICIENT)
- At session start: read `docs/memory/README.md` and active project memory only.
- Use `~/.config/opencode/memory/` for global rules, token baseline and task registry.
- Do not re-read full docs; use targeted grep/read ranges.
- Keep outputs compact; reuse memory files instead of re-analysis.
- Anime Engine priority over Assistant App until verified completion.
