#!/usr/bin/env bash
set -euo pipefail

# Prepares a reviewable deployment package. It never deploys, pushes, or changes production.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT/deployment-package}"
BACKEND_IMAGE="${BACKEND_IMAGE:-not-provided}"
IMAGE_DIGEST="${IMAGE_DIGEST:-not-provided}"
ALLOW_DIRTY="${ALLOW_DIRTY:-false}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

cd "$ROOT"
COMMIT="$(git rev-parse HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
DIRTY="$(git status --porcelain | wc -l | tr -d ' ')"
if [[ "$DIRTY" != "0" && "$ALLOW_DIRTY" != "true" ]]; then
  echo "Working tree is dirty. Commit changes or set ALLOW_DIRTY=true for a non-release package." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PACKAGE_NAME="anime-backend-deployment-$STAMP"
PACKAGE_DIR="$OUTPUT_DIR/$PACKAGE_NAME"
mkdir -p "$PACKAGE_DIR"

{
  echo "# Anime Backend Deployment Package"
  echo
  echo "- Generated: $STAMP"
  echo "- Branch: $BRANCH"
  echo "- Commit: $COMMIT"
  echo "- Working tree dirty entries: $DIRTY"
  echo "- Backend image: $BACKEND_IMAGE"
  echo "- Image digest: $IMAGE_DIGEST"
  echo "- Deployment performed: NO"
  echo
  echo "## Required approvals before any deployment"
  echo "- [ ] OD-14 Stage 5 scope accepted"
  echo "- [ ] OD-15 separate production authorization recorded"
  echo "- [ ] AR-10 deployment approval recorded"
  echo "- [ ] Backup/restore drill evidence attached"
  echo "- [ ] Rollback owner and window confirmed"
  echo
  echo "## Migration order"
  for file in "$ROOT"/supabase/migrations/*.sql; do
    base="$(basename "$file")"
    case "$base" in *rollback*) continue ;; esac
    echo "1. $base"
  done
  echo
  echo "## Rollback files"
  for file in "$ROOT"/supabase/migrations/*rollback*.sql; do
    echo "- $(basename "$file")"
  done
  echo
  echo "## Verification commands (run before packaging/deploy approval)"
  echo '```'
  echo "npm run build"
  echo "npm test"
  echo '```'
} > "$PACKAGE_DIR/DEPLOYMENT_MANIFEST.md"

cp "$ROOT/supabase/migrations/"*.sql "$PACKAGE_DIR/" 2>/dev/null || true
cp "$ROOT/docs/operations/BACKUP_DR_RUNBOOK.md" "$PACKAGE_DIR/" 2>/dev/null || true
cp "$ROOT/docs/operations/REPLICATION_RUNBOOK.md" "$PACKAGE_DIR/" 2>/dev/null || true

(
  cd "$PACKAGE_DIR"
  sha256sum * > SHA256SUMS
)

tar -czf "$OUTPUT_DIR/$PACKAGE_NAME.tar.gz" -C "$OUTPUT_DIR" "$PACKAGE_NAME"
sha256sum "$OUTPUT_DIR/$PACKAGE_NAME.tar.gz" > "$OUTPUT_DIR/$PACKAGE_NAME.tar.gz.sha256"

echo "Prepared: $OUTPUT_DIR/$PACKAGE_NAME.tar.gz"
echo "Deployment was NOT performed."
