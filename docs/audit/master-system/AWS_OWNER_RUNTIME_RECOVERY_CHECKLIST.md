# AWS Owner Runtime Recovery Checklist

Date: 2026-11-09
Status: **BLOCKED — NO AWS ACCESS, CREDENTIALS, LOGS, OR DEPLOYMENT STATE AVAILABLE**
Scope: Read-only recovery and verification of existing AWS-originated runtime. No AWS resource was created, changed, restarted, or deleted. No production system was contacted.

## 1. Purpose

This checklist tells the Owner how to recover, inventory, verify, and safely operate the **existing** AWS runtime for the AI Cinematic Anime Engine.

It separates two environments:

| Environment | Purpose | Rule |
|---|---|---|
| Existing Owner runtime | Recover and verify what already exists | Read-only first; no recreation; no destructive action |
| Disposable test runtime | Validate changes without production risk | Separate accounts/resources/credentials; no production data |

Do not recreate existing AWS infrastructure. Do not point tests at production. Do not use production credentials for test runs.

## 2. Current Status

| Item | Status |
|---|---|
| AWS account access | NOT AVAILABLE |
| AWS region inventory | NOT INSPECTED |
| Existing compute inventory | NOT INSPECTED |
| Existing database inventory | NOT INSPECTED |
| Existing n8n inventory | NOT INSPECTED |
| Existing storage inventory | NOT INSPECTED |
| Existing DNS/TLS inventory | NOT INSPECTED |
| Existing logs/metrics | NOT INSPECTED |
| Existing backups | NOT INSPECTED |
| Existing secrets references | NOT INSPECTED |
| Existing deployment state | NOT INSPECTED |
| Existing runtime health | UNKNOWN |
| Recovery verification | BLOCKED |

No statement in this document should be read as proof that any AWS resource exists, is healthy, is configured correctly, or is reachable.

## 3. Safety Rules

1. **Read-only first.** Inventory before changing anything.
2. **No recreation.** If a resource exists, recover/verify it; do not create a duplicate.
3. **No production writes during discovery.** No database mutation, workflow activation, queue purge, or deployment.
4. **No secret values in notes.** Record secret names, ARNs, owners, and rotation status only.
5. **No SSH or shell access in this task.** OpenCode has no AWS/Termius access.
6. **No credential rotation without approval.** Rotation is a separate authorized operation.
7. **No destructive cleanup.** Do not delete old resources, snapshots, logs, or DNS records during recovery.
8. **Tag and document.** Every recovered resource needs environment, owner, purpose, and criticality.
9. **Test in isolation.** Disposable test resources must not share production databases, buckets, n8n, or secrets.
10. **Stop on ambiguity.** If a resource’s environment is unclear, mark it `BLOCKED` and ask the Owner.

## 4. Owner Access Checklist

- [ ] Confirm AWS account ID and account alias.
- [ ] Confirm all regions in use.
- [ ] Confirm IAM identity used for read-only inventory.
- [ ] Confirm read-only permissions for EC2, ECS/EKS, Lambda, RDS, S3, CloudFront, Route 53, ACM, Secrets Manager/SSM, CloudWatch, SNS/SQS, IAM, VPC, and billing.
- [ ] Confirm whether n8n, Supabase, GPU workers, and Telegram are AWS-hosted or external.
- [ ] Confirm environment tags: production, staging, test, development.
- [ ] Confirm who owns each resource and who can approve changes.
- [ ] Confirm billing/alert owner.
- [ ] Confirm backup/restore owner.
- [ ] Confirm incident/rollback owner.

## 5. Resource Inventory

Complete one row per resource. Use `PRESENT`, `ABSENT`, `UNKNOWN`, or `BLOCKED`. Do not paste secrets.

### 5.1 Compute and application

| Resource | Expected purpose | Evidence to capture | Status | Notes |
|---|---|---|---|---|
| Backend compute (ECS/EKS/EC2/Lambda/other) | Hosts `ai-anime-backend` | Service/cluster/instance ID, region, image/tag, desired/running count, health | UNKNOWN | |
| Backend load balancer | Public API entry | ARN, DNS, listener, target health, TLS certificate | UNKNOWN | |
| Backend autoscaling | Capacity | Min/max/desired, policies, recent scaling events | UNKNOWN | |
| Backend deployment history | Current/previous version | Task definition/revision, image digest, deploy time, rollback target | UNKNOWN | |
| Backend environment configuration | Runtime config | Variable names only; no values | UNKNOWN | |
| Backend health endpoint | Liveness/readiness | URL, status code, response time, timestamp | UNKNOWN | |
| n8n compute | Workflow runtime | Host/instance/service, version, health, execution mode | UNKNOWN | |
| CPU worker compute | TTS/FFmpeg | Host/service, health, version, reachable URL | UNKNOWN | |
| GPU worker compute | Image/video/animation/lip-sync/voice | Provider, host, GPU model, VRAM, health, model availability | UNKNOWN | |
| Scheduled jobs | Retries/cleanup/sync | Schedule, last run, next run, owner | UNKNOWN | |
| Container registry | Backend/worker images | Repository, image tags/digests, scan status | UNKNOWN | |

### 5.2 Data and storage

| Resource | Expected purpose | Evidence to capture | Status | Notes |
|---|---|---|---|---|
| Primary database | Platform/control and/or user content | Provider, region, instance, version, size, connection mode, backup status | UNKNOWN | |
| Secondary database | Replication/recovery | Provider, region, replication lag, consistency check | UNKNOWN | |
| Database migrations | Schema state | Applied migration list, drift check, rollback point | UNKNOWN | |
| Object storage | Media/assets | Bucket/provider, region, lifecycle, encryption, public-access status | UNKNOWN | |
| Telegram storage | Media delivery | Bot/storage chat configured? retention? quota? | UNKNOWN | |
| Backups | Recovery | Snapshot/PITR status, last restore test, retention, encryption | UNKNOWN | |
| Secrets store | Credentials | Secret names/ARNs, owner, consumers, rotation status | UNKNOWN | |
| Cache/queue | Jobs/outbox | Provider, queue names, dead-letter policy, retention | UNKNOWN | |

### 5.3 Network, DNS, and security

| Resource | Expected purpose | Evidence to capture | Status | Notes |
|---|---|---|---|---|
| VPC/subnets | Network isolation | CIDR, public/private subnets, route tables | UNKNOWN | |
| Security groups/firewall | Access control | Ingress/egress rules, exposed ports, source ranges | UNKNOWN | |
| DNS | API/media hostnames | Hosted zone, records, TTL, ownership | UNKNOWN | |
| TLS certificate | HTTPS | Certificate ARN, domains, expiry, issuer | UNKNOWN | |
| WAF/rate limiting | Abuse protection | Rules, thresholds, logging | UNKNOWN | |
| IAM roles/policies | Least privilege | Role names, attached policies, last used | UNKNOWN | |
| Public endpoints | Exposure review | Endpoint, auth, intended audience | UNKNOWN | |
| Logging/audit | Observability | Log groups, retention, access, redaction | UNKNOWN | |
| Alarms | Incident response | Alarm names, thresholds, notification targets | UNKNOWN | |

### 5.4 External dependencies

| Dependency | Purpose | Evidence to capture | Status | Notes |
|---|---|---|---|---|
| Supabase Auth | Identity | Project ref, JWT settings, redirect URLs, refresh/revocation behavior | UNKNOWN | |
| Supabase database | Platform/control | Project ref, region, plan, backups, RLS status | UNKNOWN | |
| n8n | 14 canonical workflows | Instance, version, workflow count/IDs, active state, credentials objects | UNKNOWN | |
| Telegram | Storage/delivery | Bot identity, storage chat, webhook, retention | UNKNOWN | |
| AI providers | Groq/Gemini/NVIDIA/compatible | Account, model access, quota, rate limits | UNKNOWN | |
| GPU providers | Kaggle/Colab/Lightning/custom | Account, quota, VRAM, model weights | UNKNOWN | |
| CPU providers | GitHub Actions/VPS/custom | Account, runner capacity, secrets | UNKNOWN | |

## 6. Recovery Sequence

### Phase 0 — Read-only discovery

- [ ] Inventory all resources and tags.
- [ ] Capture current deployment image/tag/digest.
- [ ] Capture DNS, TLS, and endpoint health.
- [ ] Capture database version, size, backup, and replication status.
- [ ] Capture n8n version, workflow inventory, and active state.
- [ ] Capture worker health and model availability.
- [ ] Capture secret names and consumers; do not print values.
- [ ] Capture logs, alarms, and recent incidents.
- [ ] Record unknowns and conflicts.

Exit: complete inventory; no changes made.

### Phase 1 — Health verification

- [ ] Verify backend health and a safe read-only endpoint.
- [ ] Verify database connectivity using a read-only check.
- [ ] Verify n8n health without activating workflows.
- [ ] Verify worker health without submitting paid jobs.
- [ ] Verify storage read access with a safe test object.
- [ ] Verify DNS/TLS from an external network.
- [ ] Verify logs are receiving data and are redacted.
- [ ] Record exact timestamps and results.

Exit: current health is known; failures are documented.

### Phase 2 — Recovery planning

- [ ] Identify what is missing, broken, or drifted.
- [ ] Identify the minimum safe recovery action for each gap.
- [ ] Confirm backup/restore point before any change.
- [ ] Confirm rollback target and owner.
- [ ] Confirm no duplicate resource will be created.
- [ ] Confirm change window and approval.
- [ ] Confirm test environment is separate.

Exit: approved recovery plan with rollback.

### Phase 3 — Controlled recovery

Only after explicit Owner approval:

- [ ] Apply the minimum change.
- [ ] Verify health after each step.
- [ ] Record before/after evidence.
- [ ] Stop on unexpected impact.
- [ ] Roll back if acceptance checks fail.
- [ ] Do not activate n8n workflows unless separately approved.

Exit: runtime restored and verified, or rolled back.

### Phase 4 — Verification and handover

- [ ] Backend health and safe API checks pass.
- [ ] Database read/write test in isolated environment only.
- [ ] n8n inventory remains exactly 14 canonical workflows.
- [ ] Worker health and a safe deterministic job pass.
- [ ] Storage upload/read/delete test in isolated environment.
- [ ] Logs/alerts verified.
- [ ] Backup restore test recorded.
- [ ] Secret inventory and rotation status recorded.
- [ ] Owner sign-off.

## 7. Environment Separation Checklist

- [ ] Production and test use different AWS accounts or clearly separated resources.
- [ ] Test database contains no production user data.
- [ ] Test n8n is separate and does not point at production.
- [ ] Test workers use test credentials and test storage.
- [ ] Test Telegram uses a test bot/chat.
- [ ] Test provider keys have isolated quotas.
- [ ] Test secrets are not production secrets.
- [ ] Test URLs do not contain `prod` or `production`.
- [ ] Test runs cannot write to production databases or buckets.
- [ ] Cleanup is scoped to disposable test resources only.

## 8. Secret Recovery Checklist

Record names and status only. Never record values.

- [ ] JWT signing/verification keys.
- [ ] Supabase service/restricted credentials.
- [ ] n8n API key and webhook/callback secret.
- [ ] Worker callback secret and job-signing key.
- [ ] Telegram bot token and storage chat ID.
- [ ] Encryption master/root key and key versions.
- [ ] AI provider keys (Groq/Gemini/NVIDIA/compatible).
- [ ] GPU provider credentials.
- [ ] CPU provider credentials.
- [ ] Storage provider credentials.
- [ ] Database migration credentials.
- [ ] Monitoring/alerting credentials.
- [ ] Confirm no secret is embedded in workflow JSON, source, images, logs, or reports.
- [ ] Confirm rotation owner and emergency revocation procedure.

## 9. Backup and Rollback Checklist

- [ ] Identify recovery point objective and recovery time objective.
- [ ] Confirm database backup/PITR window.
- [ ] Confirm object-storage versioning/lifecycle.
- [ ] Confirm n8n workflow export/backup.
- [ ] Confirm worker image/config backup.
- [ ] Confirm DNS/TLS rollback path.
- [ ] Confirm secret rollback/dual-validity plan.
- [ ] Perform a restore test in isolation.
- [ ] Record restore duration and data consistency.
- [ ] Name the rollback authority.
- [ ] Do not roll back without a reconciliation report.

## 10. Monitoring and Incident Checklist

- [ ] Backend error rate and latency alarms.
- [ ] Database connection/storage alarms.
- [ ] n8n failed-execution alarm.
- [ ] Worker health and queue-depth alarm.
- [ ] Job stuck/terminal-state alarm.
- [ ] Storage quota/upload failure alarm.
- [ ] Auth failure/abuse alarm.
- [ ] Secret-expiry/rotation reminder.
- [ ] Billing anomaly alarm.
- [ ] On-call owner and escalation path.
- [ ] Incident runbook location.
- [ ] Log redaction verified.

## 11. Evidence Template

For every recovered resource record:

```text
Resource:
Environment:
Region:
Identifier/ARN:
Owner:
Purpose:
Criticality:
Current state:
Evidence source:
Evidence timestamp:
Health result:
Backup/rollback:
Secret references (names only):
Change required:
Approval:
Verification:
Remaining risk:
```

## 12. Exit Criteria

AWS runtime recovery is complete only when:

- [ ] Every expected resource is inventoried or explicitly marked absent/unknown.
- [ ] Current health is verified from evidence, not assumption.
- [ ] Production and test environments are separated.
- [ ] No resource was recreated unnecessarily.
- [ ] Backup/restore and rollback are verified.
- [ ] Secrets are inventoried without values and rotation status is known.
- [ ] Monitoring/alerts are verified.
- [ ] Existing runtime is either healthy and verified, or the remaining gaps are documented and blocked.
- [ ] Owner signs off.

## 13. Current Decision

- AWS runtime recovery is **BLOCKED**.
- No AWS resource was inspected.
- No AWS resource was changed.
- No production system was contacted.
- No credential was rotated.
- The checklist is ready for Owner execution.

## 14. Safety Statement

- No AWS action occurred.
- No production database, n8n, worker, Telegram, or Android runtime was contacted.
- No secret value is included in this document.
- No stage was marked complete.
