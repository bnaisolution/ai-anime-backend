# BUG LIST — Anime Engine (living document)

Legend — Severity: **P0** app unusable / data loss · **P1** core feature broken · **P2** minor break / workaround exists · **P3** cosmetic
Status: `OPEN` → `FIXING` → `FIXED (verify pending)` → `CLOSED`

| ID | Feature | Sev | Screen / Button | Steps | Expected | Actual | Layer | Evidence | Status |
|----|---------|-----|-----------------|-------|----------|--------|-------|----------|--------|
| —  | —       | —   | —               | —     | —        | —      | —     | —        | —      |

## Open defects carried from API runtime validation

| ID | Sev | Title | Notes | Status |
|----|-----|-------|-------|--------|
| D2 | P2 | Logout ke baad access token ~1h valid rehta hai | Refresh token revoke hota hai, access token stateless verify hota hai; client ko token locally clear karna chahiye | OPEN |
| D3 | P3 | Worker CI `upload-artifact` step fail (code pass) | GitHub-side flake; rerun `startup_failure` de raha hai | OPEN |
| D5 | P2 | `/api/v1/auth/me` me `workspaceId` empty (normal user) | Login response me `default-workspace` aata hai, `/me` me `""` | OPEN |
