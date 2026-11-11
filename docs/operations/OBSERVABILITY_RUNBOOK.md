# Observability Runbook

## Signals

- `GET /v1/anime/live` — process liveness.
- `GET /v1/anime/ready` — database readiness; returns 503 when the dependency is down.
- `GET /v1/anime/metrics` — Prometheus text; disabled by default. Enable with `ANIME_METRICS_ENABLED=true` and protect with `ANIME_METRICS_TOKEN`.

## Core metrics

- `anime_http_requests_total{method,route,status}`
- `anime_http_request_duration_seconds{method,route}`
- `anime_dependency_up{dependency="database"}`
- `anime_readiness_check_duration_seconds`
- `anime_process_uptime_seconds`
- `anime_process_memory_bytes{kind="rss"}`

## Alerting

- Page on readiness failure for more than 5 minutes.
- Page on 5xx rate above 5% for 10 minutes.
- Warn on p95 request duration above 5 seconds for 15 minutes.
- Warn when database dependency is down for more than 2 minutes.
- Deduplicate alerts for 15 minutes; include request ID, route, status, and dependency.

## Incident response

1. Confirm `/v1/anime/live` and `/v1/anime/ready`.
2. Check database connectivity and recent migrations.
3. Check n8n execution failures and worker callback failures.
4. Check provider rate-limit cooldowns and low-TPM budget exhaustion.
5. If a deploy caused the incident, stop the rollout and use the documented rollback path.
6. Record timeline, impact, root cause, corrective action, and follow-up owner.
