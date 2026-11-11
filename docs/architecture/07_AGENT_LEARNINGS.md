# AGENT LEARNED RULES & PITFALLS

1. [Android Media3]: Always attach `Authorization: Bearer <token>` on `/v1/media/telegram/:file_id` streams; unauthenticated requests fail with 401/403.
2. [n8n Webhooks]: Use strictly the 14 canonical workflow IDs. Legacy IDs (e.g., BwP2..., S71...) are deprecated duplicates.
3. [EC2 Memory]: Local compilation causes Linux OOM killer. Never compile JVM artifacts locally; always push to GitHub Actions CI.
4. [Backend Env]: Batch 4 introduced mandatory `JWT_ISSUER` and `JWT_AUDIENCE` in server `.env`; container fails to start without them.
5. [Merge Order]: Backend CI checks out Android + Worker siblings at `SIBLING_REF=main`, so merge order MUST be Worker -> Android -> Backend; otherwise backend `main` runs cross-repo contract tests against stale code and goes red.
