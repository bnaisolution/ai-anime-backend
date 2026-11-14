# Report C — Migration Safety Review

Files: 003, 004, 005, 006 (+ rollbacks).

Dependency order: 003 → 004 → 005 → 006 (verified).

Findings:
- 003: additive prompt library columns/tables + RLS service-role policies. Safe replay (IF NOT EXISTS).
- 004: payload redaction functions/triggers. Redaction is irreversible; rollback cannot restore redacted secrets (acceptable security improvement).
- 005: tenant tables + legacy tenant backfill + RLS. Additive; owner endpoints depend on these tables.
- 006: platform pool/queue/lease/usage tables + RLS. Additive; platform managed disabled by default.

Risks:
- Missing FK/table if order violated.
- Rollback of 003 after data use can drop prompt_versions and categorization.
- 005 backfill assumes projects table present.
- RLS service-role only; restricted DB role still pending.

Requirements before apply:
- Full DB backup (pg_dump) + verified restore.
- Staging validation on non-prod or transactional test.
- Owner approval.
- Post-apply verification of owner endpoints.

No migrations applied.
EOF