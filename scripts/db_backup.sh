#!/usr/bin/env bash
set -euo pipefail
# Usage: DB_URL="postgres://..." ./scripts/db_backup.sh [output_file]
OUT="${1:-anime_backup_$(date +%Y%m%d_%H%M%S).dump}"
if [ -z "${DB_URL:-}" ]; then
  echo "DB_URL is required" >&2
  exit 1
fi
pg_dump "$DB_URL" -Fc -f "$OUT"
echo "Backup written to $OUT"
