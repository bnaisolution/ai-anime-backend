# Migration Backup & Rollback Runbook (Anime Engine)

Pre-apply (approval required):
1. Confirm DB host: pooler `aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.<ref>`.
2. Full backup: `pg_dump -Fc -f anime_pre_003_006.dump`.
3. Verify restore on disposable DB or transactional test.
4. Record current schema snapshot and row counts for affected tables.

Apply order:
1. 003_batch2_prompt_library.sql
2. 004_batch4_payload_security.sql
3. 005_batch4_tenant_platform.sql
4. 006_batch4_platform_pool.sql
Use `psql -v ON_ERROR_STOP=1 -1` per file or single transaction where possible.

Post-apply verification:
- `\dt` / table existence for new tables.
- Owner endpoints `/v1/anime/owner/quota`, `/tenants` return 200.
- Prompt Studio category persistence.
- No credential leakage in api_commands/outbox payload.

Rollback:
- Reverse order using rollback files.
- Note 004 redaction is irreversible (acceptable).
- 003 rollback drops prompt_versions/project_prompt_associations and categorization columns.
- Restore from backup if rollback insufficient.

Approval required before execution.
EOF