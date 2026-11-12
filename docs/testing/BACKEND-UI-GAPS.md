# BACKEND ↔ UI GAP AUDIT (2026-11-12)

Backend routes ~88 anime endpoints; Android calls ~59. Neeche wo capabilities jo backend me **live** hain par app me koi screen/button nahi.

| # | Backend capability | Route / evidence | Live status | UI me kya missing | Value |
|---|---|---|---|---|---|
| G-01 | **Readiness / preflight** | `GET /v1/anime/ready` → `{"ok":true,"status":"ready","dependencies":{"database":"up"}}` | 200 | koi screen nahi | C-11/C-13 ka base, par abhi sirf DB check karta hai — project-level checks add karne honge |
| G-02 | **Model catalog + model select** | `GET /v1/anime/platform/models`, `POST /platform/models/select` | 200 (Llama/Gemini list) | Settings me model choose karne ka option nahi | User apna LLM chun sake |
| G-03 | **Provider catalog (credentials)** | `GET /v1/anime/platform/providers` | 200 (groq/gemini, `requires_credentials`) | koi UI nahi | Provider connect/keys flow |
| G-04 | **GPU pool reserve/release/queue** | `/platform/pool/reserve`, `/release`, `/queue`, `/status` | 200 | sirf `gpu` info dikhta hai | Worker capacity control |
| G-05 | **Cost / usage / fallback plan** | `/platform/billing/summary`, `/platform/usage`, `/platform/fallback/plan` | available | Budget screen sirf project budget dikhata hai | Real spend + fallback planning |
| G-06 | **Infrastructure credential vault** | `/infrastructure/:id/{bind,unbind,rotate,revoke,verify,lifecycle}`, `/key-custody`, `/reencrypt`, `/validate` | routes live | koi screen nahi | Key rotate/revoke = security feature |
| G-07 | **Workflow control (write)** | `/admin/workflows/{deploy,activate,deactivate}`, `/registry` | 200 | Workflow screen read-only | App se WF deploy/activate |
| G-08 | **Storage providers + upload** | `/storage/providers`, `/storage/status`, `/storage/upload`, `/projects/:id/assets/upload-sessions` | live | upload kahin nahi (cover image bhi URL-only) | C-06 ka backend ready hai |
| G-09 | **Multi-tenant management** | `/tenants`, `/tenants/:id/default`, `/tenants/current`, `/owner/tenants` | 200 (`Legacy Workspace`) | Owner screen partial | Tenant switch/default |
| G-10 | **DR failover** | `/owner/replication/failover` (+ `status`) | status 200, failover UI nahi | status shown, action nahi | Bada owner action |
| G-11 | **Platform-managed mode** | `/owner/platform-managed/activate`, `/status` | 200 (`enabled:false, mode:byod`) | koi UI nahi | Billing/pooled capacity switch |
| G-12 | **Push device tokens** | `/devices/fcm-tokens` | live | notifications sirf in-app | Background alerts |
| G-13 | **Prompt version history + compatibility** | `/prompts/:id/versions`, `/prompts/validate-compatibility` | live | Prompt Studio me nahi | Prompt rollback/validation |
| G-14 | **Pending actions list (stage/priority/retry)** | DB `pending_actions` (6 rows, `stage`, `ready_at`, `last_error`) | data hai | koi list API/UI nahi | **C-13 preflight screen ka natural data source** |
| G-15 | **Project story timeline** | `GET /projects/:id/timeline` | live | Canon screen me full timeline nahi | Story continuity view |
| G-16 | **Live/telemetry** | `/v1/anime/live`, `/metrics` (currently `metrics_disabled`) | 200 / 404 | Home par sirf health dot | Live pipeline telemetry |
| G-17 | **Server-side stage gate** | `STAGE_DEPENDENCY_BLOCKED` error code defined | **unused** | no gate | C-11 ko backend-enforced banana hoga |

## Notes
- `pending_actions` me already `stage / priority / ready_at / retry_count / last_error` columns hain → preflight screen ka data model mostly ready hai, sirf read API + UI chahiye.
- `episodes.word_count` column bhi already hai → C-15 (word target) schema change ke bina ho sakta hai.
- `/metrics` `metrics_disabled` return karta hai (env flag) — UI banane se pehle enable karna padega.
