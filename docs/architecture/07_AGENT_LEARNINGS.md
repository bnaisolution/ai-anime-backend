# AGENT LEARNED RULES & PITFALLS

1. [Android Media3]: Always attach `Authorization: Bearer <token>` on `/v1/media/telegram/:file_id` streams; unauthenticated requests fail with 401/403.
2. [n8n Webhooks]: Use strictly the 14 canonical workflow IDs. Legacy IDs (e.g., BwP2..., S71...) are deprecated duplicates.
3. [EC2 Memory]: Local compilation causes Linux OOM killer. Never compile JVM artifacts locally; always push to GitHub Actions CI.
4. [Backend Env]: Batch 4 introduced mandatory `JWT_ISSUER` and `JWT_AUDIENCE` in server `.env`; container fails to start without them.
5. [Merge Order]: Backend CI checks out Android + Worker siblings at `SIBLING_REF=main`, so merge order MUST be Worker -> Android -> Backend; otherwise backend `main` runs cross-repo contract tests against stale code and goes red.
6. [Auth 503]: `AUTH_NOT_CONFIGURED` (HTTP 503) means `SUPABASE_ANON_KEY` is empty in container env — NOT a stale build. Correct endpoint is `/api/v1/auth/login` (`/v1/auth/login` returns 404). Login uses the Manager project (`icypjilkcqylgbpmkyes`), not the anime data project. New-format `sb_publishable_...` keys work in `SUPABASE_ANON_KEY`; after any `.env` change a `--force-recreate` is required (restart alone does not reload env_file).
7. [Runtime]: `/v1/anime/owner/quota` and `/v1/anime/owner/tenants` return 500 `Tenant membership lookup failed.` because `supabase/migrations/005_batch4_tenant_platform.sql` was never applied to the anime project (`anime_tenants` / `anime_tenant_members` tables absent).
8. [Runtime]: `/api/v1/auth/logout` revokes the refresh token (subsequent refresh = 401) but the access token stays valid until `exp` (~1h) because validation is stateless — client must clear the token locally on logout.
