# Infrastructure Key Rotation Runbook

## Scope
`user_infrastructure.config_encrypted` is encrypted with AES-256-GCM. Key versions are tracked in `user_infrastructure.key_version`. Root key material must live outside the database (environment secret store or KMS reference).

## Configuration
- `ANIME_ENCRYPTION_KEYS`: JSON object mapping positive integer versions to keys, e.g. `{"1":"...","2":"..."}`. Each key must be at least 32 characters.
- `ANIME_ENCRYPTION_KEY_VERSION`: current write version. Must exist in `ANIME_ENCRYPTION_KEYS`.
- `ANIME_ENCRYPTION_KEY`: legacy single-key fallback, treated as version 2.
- `ANIME_ENCRYPTION_KEY_PREVIOUS`: comma-separated legacy keys kept only for decryption.
- `ANIME_KMS_KEY_ID`: optional KMS key reference. Presence marks custody as KMS-ready; this does not call a KMS API.

## Rotation
1. Add a new key to `ANIME_ENCRYPTION_KEYS` with the next version. Keep all old keys.
2. Set `ANIME_ENCRYPTION_KEY_VERSION` to the new version and restart the backend.
3. Verify `GET /v1/anime/infrastructure/key-custody` reports the new current version and expected versions.
4. Dry-run: `POST /v1/anime/infrastructure/reencrypt` with `{"dry_run": true}`.
5. Re-encrypt: repeat with `{"dry_run": false}`. The response reports `rotated`, `skipped`, `failed`.
6. Verify a sample record decrypts and that `key_version` equals the current version.
7. Keep previous keys available for at least one full backup/restore cycle.

## Recovery and rollback
- If re-encryption fails, restore the pre-rotation database backup and keep the old current version.
- Never remove an old key while any row still references that version.
- If a key is lost, records encrypted only with that key are unrecoverable. Do not attempt to bypass authentication failures.
- Re-encryption is idempotent; safe to rerun after partial failure.

## Evidence required
- Key-version and rotation unit tests.
- Isolated database re-encryption run with counts.
- Post-rotation decrypt check and backup restore check.
- Confirmation that no key material appears in logs, API responses, or audit records.
