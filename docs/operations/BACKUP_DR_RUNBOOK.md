# Backup and Disaster Recovery Runbook

## Backup

- Run `scripts/backup_anime_db.sh` with `ANIME_BACKUP_DATABASE_URL` and `ANIME_BACKUP_DIR`.
- The script uses `pg_dump --format=custom`, writes a SHA-256 checksum, verifies the dump with `pg_restore --list`, and applies `ANIME_BACKUP_RETENTION_DAYS`.
- Never place the backup directory in a public bucket or commit dumps to Git.
- Target RPO: 24 hours unless the Owner approves a tighter schedule.

## Restore

- Verify the dump checksum before restore.
- Set `ANIME_RESTORE_DATABASE_URL` to the intended target and `ANIME_RESTORE_CONFIRM=YES`.
- Run `scripts/restore_anime_db.sh <backup.dump>`.
- Restore into an isolated database first. Production restore requires the separate production authorization.

## Drill

- Run `scripts/dr_drill.sh <backup.dump>` with `ANIME_DRILL_DATABASE_URL` and `ANIME_DRILL_CONFIRM=YES`.
- The drill database must be isolated and must not equal the backup source.
- Record restore duration, table count, smoke result, and rollback outcome.
- Target RTO: 4 hours unless the Owner approves a different target.
