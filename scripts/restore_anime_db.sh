#!/usr/bin/env sh
set -eu

umask 077

: "${ANIME_RESTORE_DATABASE_URL:?ANIME_RESTORE_DATABASE_URL is required}"
DUMP="${1:-}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "usage: $0 <backup.dump>" >&2
  exit 1
fi
if [ "${ANIME_RESTORE_CONFIRM:-}" != "YES" ]; then
  echo "restore refused: set ANIME_RESTORE_CONFIRM=YES after verifying the target and rollback plan" >&2
  exit 1
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required" >&2
  exit 1
fi
if [ -f "$DUMP.sha256" ]; then
  (cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256")
fi

pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$ANIME_RESTORE_DATABASE_URL" "$DUMP"
echo "restore completed into the confirmed target"
