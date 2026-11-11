# Platform-Managed Pool Runbook

## Activation boundary
Platform-Managed is disabled unless all of the following are true:
- `ANIME_PLATFORM_MANAGED_ENABLED=true`
- `ANIME_PLATFORM_MANAGED_OWNER_APPROVED=true`
- Owner launch approval is recorded separately.

BYOD remains the default. This runbook does not grant production activation.

## Capacity model
`anime_platform_pool_capacity` stores `resource`, `provider_id`, `total_units`, `max_concurrency`, and `enabled`. Capacity is disabled by default. `resource` is one of `gpu`, `cpu`, `llm`, or `storage`.

## Reservation flow
1. `POST /v1/anime/platform/pool/reserve` with tenant, resource, provider, units, optional TTL, and idempotency key.
2. The atomic SQL function `reserve_anime_platform_capacity` either creates a lease or queues the request.
3. Leases expire automatically at `expires_at`; release active leases with `POST /v1/anime/platform/pool/release`.
4. Queue items are visible at `GET /v1/anime/platform/pool/queue`; cancel with `POST /v1/anime/platform/pool/queue/:id/cancel`.
5. `drainPlatformQueue` promotes queued work when capacity is available.

## Metering and billing
- `POST /v1/anime/platform/usage` records units with an idempotency key.
- Billing is zero unless `ANIME_PLATFORM_BILLING_ENABLED=true`; metering still records raw units.
- `GET /v1/anime/platform/billing/summary` aggregates unbilled/billed usage by resource.
- Never mark usage as billed without an external invoice reference and Owner approval.

## Tenant isolation
Every lease, queue item, and usage row carries `tenant_id`. Routes resolve the caller's tenant membership before invoking the service. Never accept a tenant ID without `resolveTenant` authorization.

## Required runtime evidence
- Migration replay on an isolated database.
- Capacity exhaustion, queueing, promotion, release, and expiry tests.
- Idempotent reserve and usage tests.
- Tenant A cannot read or mutate tenant B leases, queue items, or usage.
- Billing remains zero while disabled; activation is a separate Owner decision.
