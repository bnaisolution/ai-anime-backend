#!/usr/bin/env sh
set -eu

: "${ANIME_DRILL_DATABASE_URL:?ANIME_DRILL_DATABASE_URL is required}"
DUMP="${1:-}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "usage: $0 <backup.dump>" >&2
  exit 1
fi
DRY_RUN="${DRY_RUN:-true}"

if [ "$DRY_RUN" = "true" ]; then
  echo "dry-run: would restore $DUMP into the isolated drill database"
  echo "dry-run: would run read-only smoke checks (select 1, table count)"
  exit 0
fi
if [ "${ANIME_DRILL_CONFIRM:-}" != "YES" ]; then
  echo "drill refused: set ANIME_DRILL_CONFIRM=YES and use an isolated database" >&2
  exit 1
fi
if [ "$ANIME_DRILL_DATABASE_URL" = "${ANIME_BACKUP_DATABASE_URL:-}" ]; then
  echo "drill refused: drill database must not be the backup source" >&2
  exit 1
fi

ANIME_RESTORE_DATABASE_URL="$ANIME_DRILL_DATABASE_URL" ANIME_RESTORE_CONFIRM=YES "$(dirname "$0")/restore_anime_db.sh" "$DUMP"
psql "$ANIME_DRILL_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'select 1 as drill_ok;'
psql "$ANIME_DRILL_DATABASE_URL" -v ON_ERROR_STOP=1 -c "select count(*) as public_tables from information_schema.tables where table_schema = 'public';"
echo "drill completed; record RPO/RTO and rollback evidence before production use"
