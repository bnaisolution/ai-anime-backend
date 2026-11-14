# Anime Engine Task Registry (Categorized)

Ready for implementation (after approval where noted):
- AE-01: Verify migrations 003-006 dependency order. Status: DONE (reviewed).
- AE-02: DB backup/rollback plan. Status: DONE (plan required before apply).
- AE-03: Fix n8n WF-03 ($node.name callbacks + dead GPU tunnel). Status: ROOT CAUSE IDENTIFIED; fix not applied.
- AE-04: Verify backend/worker auth contracts. Status: PENDING (code review).
- AE-05: Android secure token storage + backup exclusion. Status: PENDING.
- AE-06: Screen/button discovery registry. Status: DONE (auto-generated, needs refinement).

Waiting for owner approval:
- AE-07: Apply DB migrations 003-006 (approval required).
- AE-08: Backend redeploy after n8n fixes (approval required).
- AE-09: PAT rotation and remote URL cleanup (approval required).

Waiting for external access:
- AE-10: GPU tunnel refresh (Kaggle session stale).
- AE-11: Telegram live storage test (bot/token needed).

Requires physical Android device testing:
- AE-12: Manual screen/button test execution with APK.
- AE-13: Accessibility/TalkBack verification.

Blocked:
- Free AI usage limit (~8.7h) for inference-heavy validation.
EOF