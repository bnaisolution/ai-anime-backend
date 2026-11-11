# Deployment Package Runbook

## Purpose
Prepare a reviewable deployment package without deploying. This runbook does not authorize production changes.

## Package contents
- `DEPLOYMENT_MANIFEST.md` with branch, commit, dirty-tree status, image reference/digest, approval checklist, migration order, and rollback files.
- Additive and rollback SQL migrations.
- Backup/DR and replication runbooks.
- `SHA256SUMS` for package files and a checksum for the tarball.

## Build
```bash
cd ai-anime-backend
BACKEND_IMAGE=ghcr.io/example/anime-backend IMAGE_DIGEST=sha256:... ./scripts/build_deployment_package.sh
```
The script refuses a dirty tree unless `ALLOW_DIRTY=true` is set for a non-release package. It never runs Docker, pushes images, applies migrations, restarts services, or contacts production.

## Review gates
1. Confirm the manifest commit matches the reviewed commit.
2. Confirm the image digest matches the tested artifact.
3. Confirm all tests and isolated migration/restore drills passed.
4. Confirm OD-14, OD-15, and AR-10 approvals are recorded.
5. Confirm the rollback owner and maintenance window.

## Rollback outline
1. Stop new work and preserve logs.
2. Restore the pre-deployment database backup if migrations changed data.
3. Deploy the previous image digest.
4. Verify health, tenant isolation, quota, and callbacks.
5. Record the incident and rollback evidence.

## Prohibited in this package
- No production deployment.
- No image push.
- No destructive migration.
- No secret material in the package.
