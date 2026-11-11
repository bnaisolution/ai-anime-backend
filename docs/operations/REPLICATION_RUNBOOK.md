# Replication and Failover Runbook

## Configuration
- `ANIME_REPLICATION_MODE=http` enables the HTTP replication adapter.
- `ANIME_REPLICATION_PRIMARY` JSON: `{"health_url":"https://...","lag_url":"https://...","consistency_url":"https://...","provider":"primary-db","token":"..."}`.
- `ANIME_REPLICATION_SECONDARY` JSON: same shape. Secondary is optional but required for failover.
- `ANIME_REPLICATION_FAILOVER_URL` and `ANIME_REPLICATION_FAILOVER_TOKEN` configure the external failover controller.
- `ANIME_REPLICATION_MAX_LAG_SECONDS` defaults to 300. Higher lag marks the target degraded.
- URLs must be HTTPS except loopback development endpoints.

## Status checks
`GET /v1/anime/owner/replication/status` is Owner-only. It reports primary/secondary health, lag, consistency, and whether failover is supported.

## Failover preconditions
Failover is refused unless all are true:
1. Request includes explicit confirmation.
2. A failover controller URL is configured.
3. Secondary is configured and healthy.
4. Primary and secondary consistency tokens match (or are unknown, never explicitly inconsistent).

No SQL replication commands are executed by the backend. The backend only calls the configured controller.

## Recovery
- If failover is rejected, keep the primary active and investigate lag/consistency.
- If the controller accepts failover, verify application connectivity, tenant isolation, and recent writes.
- Record the requested_by identity, timestamp, lag, consistency result, and controller response.
- Do not fail back automatically; require manual Owner review.

## Required runtime evidence
- Primary/secondary health and lag probes.
- Consistency mismatch refusal.
- Unhealthy secondary refusal.
- Confirmed failover through an isolated controller.
- No blind failover when no controller is configured.
