# Completion Truth Matrix (Anime Engine)

Status legend: VERIFIED_COMPLETE | IMPLEMENTED_NOT_VERIFIED | PARTIAL | NOT_IMPLEMENTED | BLOCKED

## Bugs (from docs/testing/BUG_LIST.md)
| ID | Status in list | Code evidence | Classification | Next |
|---|---|---|---|---|
| B-01..B-06 | FIXED (verify pending) | UI changes committed | IMPLEMENTED_NOT_VERIFIED | Device verify |
| B-07 | OPEN (test data) | DB row | PARTIAL | Owner decision |
| B-08 | FIXED (verify pending) | UI | IMPLEMENTED_NOT_VERIFIED | Device verify |
| B-09 | OPEN (contrast) | design token | PARTIAL | Design review |
| B-10..B-15 | FIXED (verify pending) | UI/nav | IMPLEMENTED_NOT_VERIFIED | Device verify |
| B-16/B-17 | FIXED commit 5f0088a | AppNavGraph wiring | IMPLEMENTED_NOT_VERIFIED | Device verify |
| B-18 | OPEN (cover upload) | backend ready | PARTIAL | Implement upload UI |
| B-19/B-20 | OPEN | settings fields | PARTIAL | Implement chips |
| B-21/B-22 | OPEN | generate/readiness | PARTIAL | Implement dynamic |
| D2 | OPEN | stateless JWT | PARTIAL | Client clear token |
| D3 | OPEN | CI flake | BLOCKED (GitHub) | Rerun when quota |
| D5 | OPEN | workspaceId empty | PARTIAL | Client handling |

## Core systems
| Area | Classification | Evidence |
|---|---|---|
| Android secure token storage | IMPLEMENTED_NOT_VERIFIED | TokenManager uses EncryptedSharedPreferences; allowBackup=false |
| Backend build/tests | IMPLEMENTED_NOT_VERIFIED | 123 safe + 19 regression (docs) |
| CPU worker contracts | IMPLEMENTED_NOT_VERIFIED | 5/5 contracts |
| n8n static | IMPLEMENTED_NOT_VERIFIED | 14/14 static |
| n8n runtime | BLOCKED | WF-03 failing; GPU tunnel stale |
| DB migrations | NOT_IMPLEMENTED (live) | 003-006 not applied |
| GPU/Telegram live | BLOCKED | No runtime/credentials tested |
| Screen/button tests | PARTIAL | Registry drafted; manual pending |

## Security remediation (executed)
- World-readable env backups: chmod 600 applied.
- DB backup script: scripts/db_backup.sh created.

## Security remaining (approval required)
- PAT rotation and remote URL cleanup.
- Port 4096 restriction.
- Duplicate OpenCode server termination.

## Next non-production actions
1. Refine screen/button registry + test IDs.
2. Prepare WF-03 fix patch (not deploy).
3. Prepare migration backup/rollback procedure.
4. Run backend targeted tests locally.
EOF