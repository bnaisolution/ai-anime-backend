# SLO, Canary and GA Runbook

Date: 2026-11-19
Scope: Phase 9 observability for the AI Director + BYOD SaaS control plane.

## 1. Signals already emitted

| Metric | Type | Source |
|---|---|---|
| `ai_director_chat_total{status,provider,error}` | counter | `director.service.ts` |
| `ai_director_actions_proposed_total{blocked}` | counter | `director.service.ts` |
| `ai_director_action_executions_total{intent}` | counter | `director.service.ts` |
| `ai_director_readiness_checks_total{overall}` | counter | `director.routes.ts` |
| `ai_director_readiness_overall{state}` | gauge | `director.routes.ts` |
| `ai_director_timeline_requests_total{status}` | counter | `director.routes.ts` |
| `ai_director_plans_total{overall,ready}` | counter | `director.routes.ts` |
| `anime_publish_oauth_starts_total{platform,configured}` | counter | `publish.routes.ts` |
| `anime_publish_oauth_callbacks_total{platform,status}` | counter | `publish.routes.ts` |
| `anime_publish_channel_tests_total{ok}` | counter | `publish.routes.ts` |
| `anime_cpu_target_tests_total{kind,ok}` | counter | `infrastructure.cpu.routes.ts` |
| `anime_saas_plan_assignments_total{plan,provider}` | counter | `saas.routes.ts` |
| `anime_http_requests_total`, `anime_http_request_duration_seconds` | counter/histogram | observability hook |
| `anime_dependency_up{dependency}` | gauge | `/v1/anime/ready` |

Scrape target: `GET /v1/anime/metrics` with `ANIME_METRICS_ENABLED=true` and `ANIME_METRICS_TOKEN` set. The endpoint returns 503 when the token is missing, so never expose it without a token.

## 2. SLO targets (initial, 7-day window)

| SLO | Target | Measurement |
|---|---|---|
| Director chat availability | 99.0% | `1 - rate(ai_director_chat_total{status="failed"}[7d]) / rate(ai_director_chat_total[7d])` |
| Director action acceptance | 99.5% | executions vs. proposed actions with `blocked="false"` |
| Readiness check success | 99.5% | checks with `overall` in (`ready`, `degraded`) |
| Publish callback success | 95.0% | `callbacks_total{status="success"}` vs. total |
| CPU target test pass (own worker) | 95.0% | `cpu_target_tests_total{ok="true"}` for `kind="own_cpu"` |
| API p95 latency | < 800 ms | `histogram_quantile(0.95, anime_http_request_duration_seconds)` |
| API 5xx rate | < 0.5% | `anime_http_requests_total{status=~"5.."}` |

Alert when an SLO burns 2% of the 7-day error budget in 1 hour, or when `anime_dependency_up == 0` for 2 minutes.

## 3. Canary procedure

1. Baseline: capture 24 h of metrics with all new flags off.
2. Enable `DIRECTOR_CAPABILITIES_V2` + `DIRECTOR_READINESS` for 10% of owner/test accounts (flags are deployment-wide today; use a separate container tag for the canary).
3. Watch readiness/action counters and 5xx for 1 hour; roll back on any SLO burn.
4. Promote to 50%, then 100%. Keep `BYOD_FAIL_CLOSED=false` until readiness has been correct for 7 days.
5. Publish OAuth: enable `PUBLISH_OAUTH_V2` only after credentials are configured, then run one real connect/test/disconnect per platform.
6. SaaS billing: keep `SAAS_BILLING=false` until a provider checkout exists; manual plan assignment is owner-only and audited by the counter above.

## 4. Rollback

- Container rollback: `anime-backend:director-gap2-20261118` or `anime-backend:rollback-pre-gap1`.
- Flag rollback: set the phase flag to `false` and restart `ai-backend`.
- Migration rollback: `015..021 *_rollback.sql` (only after confirming no dependent rows).
- Kill switches are per flag; there is no per-user flag override yet.

## 5. GA checklist

- [ ] Migrations 015–021 applied and verified through the pooler.
- [ ] 14 workflows validated on the BYOD plane (`scripts/e2e/byod_validation.py validate`).
- [ ] Cross-tenant denial, pause/unpause, DSN rotation, DB-down fail-closed, restore and 7-day rollback drills passed.
- [ ] SLOs met for 7 consecutive days.
- [ ] Canary 10% → 50% → 100% completed without rollback.
- [ ] Real publish OAuth connect/test/publish passed for YouTube and Instagram.
- [ ] Billing checkout provider integrated or GA scoped to BYOD-only plans.
