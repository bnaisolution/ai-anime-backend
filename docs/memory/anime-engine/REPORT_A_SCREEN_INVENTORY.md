# Report A — Android Screen/Button Inventory

Source: ai-anime-android `app/src/main` (34 screen files, 36 routes, 204 onClick, 178 button/clickable).

Registry: `docs/memory/anime-engine/SCREEN_BUTTON_REGISTRY.md` (auto-generated, needs manual refinement).

Key findings:
- 34 screens, 36 routes (2 parameterized duplicates: production/{cmdId}, scenes/{epNo}; preflight/{pid}).
- 9 androidTest files; only 6 reference screens → large manual coverage gap.
- Dead/duplicate route risk and untested buttons likely; requires refinement and test IDs.

Status: DISCOVERED, NOT TESTED. No runtime evidence.
EOF