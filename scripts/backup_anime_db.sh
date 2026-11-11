#!/usr/bin/env sh
set -eu

umask 077

: "${ANIME_BACKUP_DATABASE_URL:?ANIME_BACKUP_DATABASE_URL is required}"
BACKUP_DIR="${ANIME_BACKUP_DIR:-./backups}"
RETENTION_DAYS="${ANIME_BACKUP_RETENTION_DAYS:-7}"
DRY_RUN="${DRY_RUN:-false}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$BACKUP_DIR/anime-${STAMP}.dump"

if [ "$DRY_RUN" = "true" ]; then
  echo "dry-run: would create $DUMP from the configured database URL"
  exit 0
fi

pg_dump --format=custom --no-owner --no-privileges --file="$DUMP" "$ANIME_BACKUP_DATABASE_URL"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$DUMP")" > "$(basename "$DUMP").sha256")
pg_restore --list "$DUMP" >/dev/null
echo "backup created: $DUMP"

find "$BACKUP_DIR" -type f -name 'anime-*.dump' -mtime "+$RETENTION_DAYS" -print -delete
find "$BACKUP_DIR" -type f -name 'anime-*.dump.sha256' -mtime "+$RETENTION_DAYS" -print -delete
