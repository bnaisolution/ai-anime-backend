import { createHash } from 'node:crypto';
import { writeAudit } from '../audit/audit.writer';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { maskConfig } from './infrastructure.crypto';
import { decryptWithKeyVersion, encryptWithCurrentKey, keyCustodyStatus } from './keyRegistry';
import * as repo from './infrastructure.repo';
import { resolveTenant } from '../tenant/tenant.service';
import { mintWorkerJobToken } from '../workers/workerToken';
import type { InfrastructurePublicDto, InfrastructureRecord, ProviderType } from './infrastructure.types';

function fingerprintConfig(config: Record<string, unknown>): string {
  const canonical = JSON.stringify(config, Object.keys(config).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

function decryptRecord(r: InfrastructureRecord): Record<string, unknown> {
  return JSON.parse(decryptWithKeyVersion(r.config_encrypted, r.key_version));
}

function toPublic(r: InfrastructureRecord): InfrastructurePublicDto {
  let cfg: Record<string, unknown> = {};
  try { cfg = decryptRecord(r); } catch { cfg = { error: 'decrypt_failed' }; }
  return {
    id: r.id, name: r.name, provider_type: r.provider_type,
    capabilities: r.capabilities, status: r.status,
    is_default: r.is_default, last_verified_at: r.last_verified_at,
    last_error: r.last_error, config_masked: maskConfig(cfg),
    key_version: r.key_version ?? 1,
    bound_tenant_id: r.bound_tenant_id ?? null,
    last_rotated_at: r.last_rotated_at ?? null,
    revoked_at: r.revoked_at ?? null,
    fingerprint: r.fingerprint ?? null,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

export async function create(userId: string, input: {
  name: string; provider_type: ProviderType; config: Record<string, unknown>;
  capabilities?: Record<string, unknown>; is_default?: boolean; request_id?: string;
}): Promise<InfrastructurePublicDto> {
  const encrypted = encryptWithCurrentKey(JSON.stringify(input.config));
  const record = await repo.insert({
    user_id: userId, name: input.name, provider_type: input.provider_type,
    config_encrypted: encrypted.ciphertext,
    capabilities: input.capabilities ?? {}, is_default: input.is_default ?? false,
  });
  const updated = await repo.update(record.id, userId, {
    key_version: encrypted.key_version,
    fingerprint: fingerprintConfig(input.config),
  });
  await writeAudit({ project_id: null, user_id: userId, workflow_name: 'INFRASTRUCTURE', action: 'CREATE_INFRASTRUCTURE', entity_type: 'USER_INFRASTRUCTURE', entity_id: record.id, new_value: { name: record.name, provider_type: record.provider_type }, request_id: input.request_id });
  return toPublic(updated);
}

export async function list(userId: string): Promise<InfrastructurePublicDto[]> {
  return (await repo.listByUser(userId)).map(toPublic);
}

export async function getById(id: string, userId: string): Promise<InfrastructurePublicDto> {
  const r = await repo.getById(id, userId);
  if (!r) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Infrastructure not found' });
  return toPublic(r);
}

export async function update(id: string, userId: string, patch: {
  name?: string; config?: Record<string, unknown>; capabilities?: Record<string, unknown>;
  status?: string; is_default?: boolean; request_id?: string;
}): Promise<InfrastructurePublicDto> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.config !== undefined) {
    const encrypted = encryptWithCurrentKey(JSON.stringify(patch.config));
    dbPatch.config_encrypted = encrypted.ciphertext;
    dbPatch.key_version = encrypted.key_version;
    dbPatch.fingerprint = fingerprintConfig(patch.config);
  }
  if (patch.capabilities !== undefined) dbPatch.capabilities = patch.capabilities;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.is_default !== undefined) dbPatch.is_default = patch.is_default;
  const updated = await repo.update(id, userId, dbPatch);
  await writeAudit({ project_id: null, user_id: userId, workflow_name: 'INFRASTRUCTURE', action: 'UPDATE_INFRASTRUCTURE', entity_type: 'USER_INFRASTRUCTURE', entity_id: id, new_value: { keys: Object.keys(dbPatch) }, request_id: patch.request_id });
  return toPublic(updated);
}

export async function remove(id: string, userId: string, requestId?: string): Promise<void> {
  await repo.remove(id, userId);
  await writeAudit({ project_id: null, user_id: userId, workflow_name: 'INFRASTRUCTURE', action: 'DELETE_INFRASTRUCTURE', entity_type: 'USER_INFRASTRUCTURE', entity_id: id, request_id: requestId });
}

export async function setDefault(id: string, userId: string, requestId?: string): Promise<void> {
  await repo.setDefault(id, userId);
  await writeAudit({ project_id: null, user_id: userId, workflow_name: 'INFRASTRUCTURE', action: 'SET_DEFAULT_INFRASTRUCTURE', entity_type: 'USER_INFRASTRUCTURE', entity_id: id, request_id: requestId });
}

export async function verify(id: string, userId: string, requestId?: string): Promise<InfrastructurePublicDto> {
  const r = await repo.getById(id, userId);
  if (!r) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Infrastructure not found' });
  if (r.status === 'revoked') {
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'Infrastructure credential has been revoked.' });
  }
  const cfg = decryptRecord(r) as Record<string, any>;
  let ok = false; let errMsg: string | null = null;
  const healthUrl = cfg.health_url || (cfg.worker_url ? `${String(cfg.worker_url).replace(/\/$/, '')}/health` : null) || (cfg.base_url ? `${String(cfg.base_url).replace(/\/$/, '')}/health` : null);
  if (healthUrl) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const healthToken = mintWorkerJobToken({
        job_id: `infra-verify-${id}`,
        project_id: 'infrastructure',
        user_id: userId,
        scope: ['health'],
        ttl_seconds: 60,
      });
      const resp = await fetch(healthUrl, { signal: ctrl.signal, headers: { authorization: `Bearer ${healthToken}` } });
      clearTimeout(timer);
      ok = resp.ok;
      if (!ok) errMsg = `HTTP ${resp.status}`;
    } catch (e: any) { errMsg = e.message ?? 'Connection failed'; }
  } else { errMsg = 'no worker_url/health_url in config'; }
  const updated = await repo.update(id, userId, { status: ok ? 'active' : 'error', last_verified_at: new Date().toISOString(), last_error: errMsg });
  await writeAudit({ project_id: null, user_id: userId, workflow_name: 'INFRASTRUCTURE', action: 'VERIFY_INFRASTRUCTURE', entity_type: 'USER_INFRASTRUCTURE', entity_id: id, new_value: { status: updated.status, error: errMsg }, request_id: requestId });
  return toPublic(updated);
}

export async function getDecryptedMapForUser(userId: string): Promise<Record<string, Record<string, unknown>>> {
  const records = await repo.getActiveByUser(userId);
  const out: Record<string, Record<string, unknown>> = {};
  for (const r of records) {
    try { out[r.provider_type] = decryptRecord(r); } catch { /* skip corrupt */ }
  }
  return out;
}

export async function getHydratedInfrastructureForUser(userId: string): Promise<Record<string, unknown>> {
  const providerConfigs = await getDecryptedMapForUser(userId);
  const hydratedInfra: Record<string, unknown> = { ...providerConfigs };
  for (const cfg of Object.values(providerConfigs)) {
    if (cfg && typeof cfg === 'object') {
      if (cfg.gpu_routing) hydratedInfra.gpu_routing = cfg.gpu_routing;
      if (cfg.telegram_storage) hydratedInfra.telegram_storage = cfg.telegram_storage;
      if (cfg.github_worker) hydratedInfra.github_worker = cfg.github_worker;
    }
  }
  return hydratedInfra;
}


export async function rotate(id: string, userId: string, config: Record<string, unknown>, requestId?: string): Promise<InfrastructurePublicDto> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Replacement config object is required.' });
  }
  const existing = await repo.getById(id, userId);
  if (!existing) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Infrastructure not found' });
  if (existing.status === 'revoked') throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'Revoked credentials cannot be rotated.' });
  const encrypted = encryptWithCurrentKey(JSON.stringify(config));
  const updated = await repo.update(id, userId, {
    config_encrypted: encrypted.ciphertext,
    key_version: encrypted.key_version,
    fingerprint: fingerprintConfig(config),
    last_rotated_at: new Date().toISOString(),
    status: 'active',
    last_error: null,
  });
  await writeAudit({ project_id: null, user_id: userId, workflow_name: 'INFRASTRUCTURE', action: 'ROTATE_INFRASTRUCTURE', entity_type: 'USER_INFRASTRUCTURE', entity_id: id, new_value: { key_version: updated.key_version }, request_id: requestId });
  return toPublic(updated);
}

export async function revoke(id: string, userId: string, requestId?: string): Promise<InfrastructurePublicDto> {
  const existing = await repo.getById(id, userId);
  if (!existing) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Infrastructure not found' });
  const encrypted = encryptWithCurrentKey('{}');
  const updated = await repo.update(id, userId, {
    config_encrypted: encrypted.ciphertext,
    key_version: encrypted.key_version,
    status: 'revoked',
    revoked_at: new Date().toISOString(),
    fingerprint: null,
    last_error: 'Revoked by owner.',
  });
  await writeAudit({ project_id: null, user_id: userId, workflow_name: 'INFRASTRUCTURE', action: 'REVOKE_INFRASTRUCTURE', entity_type: 'USER_INFRASTRUCTURE', entity_id: id, request_id: requestId });
  return toPublic(updated);
}

export async function reencryptUserInfrastructure(userId: string, requestId?: string, options?: { dry_run?: boolean }): Promise<{ rotated: number; skipped: number; failed: number; dry_run: boolean; key_custody: ReturnType<typeof keyCustodyStatus> }> {
  const records = await repo.listByUser(userId);
  let rotated = 0;
  let skipped = 0;
  let failed = 0;
  for (const record of records) {
    if (record.status === 'revoked') {
      skipped += 1;
      continue;
    }
    try {
      const config = decryptRecord(record);
      const encrypted = encryptWithCurrentKey(JSON.stringify(config));
      if (options?.dry_run) {
        rotated += 1;
      } else if (record.key_version !== encrypted.key_version || record.config_encrypted !== encrypted.ciphertext) {
        await repo.update(record.id, userId, { config_encrypted: encrypted.ciphertext, key_version: encrypted.key_version });
        rotated += 1;
      } else {
        skipped += 1;
      }
    } catch {
      failed += 1;
    }
  }
  const result = { rotated, skipped, failed, dry_run: Boolean(options?.dry_run), key_custody: keyCustodyStatus() };
  await writeAudit({ project_id: null, user_id: userId, workflow_name: 'INFRASTRUCTURE', action: 'REENCRYPT_INFRASTRUCTURE', entity_type: 'USER_INFRASTRUCTURE', entity_id: null, new_value: result, request_id: requestId });
  return result;
}

export function getKeyCustody(): ReturnType<typeof keyCustodyStatus> {
  return keyCustodyStatus();
}

export async function bindToTenant(id: string, userId: string, tenantId: string, requestId?: string): Promise<InfrastructurePublicDto> {
  await resolveTenant(userId, tenantId);
  const existing = await repo.getById(id, userId);
  if (!existing) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Infrastructure not found' });
  if (existing.status === 'revoked') throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'Revoked credentials cannot be bound.' });
  const updated = await repo.update(id, userId, { bound_tenant_id: tenantId });
  await writeAudit({ project_id: null, user_id: userId, workflow_name: 'INFRASTRUCTURE', action: 'BIND_INFRASTRUCTURE_TENANT', entity_type: 'USER_INFRASTRUCTURE', entity_id: id, new_value: { tenant_id: tenantId }, request_id: requestId });
  return toPublic(updated);
}

export function validateConfig(providerType: ProviderType, config: Record<string, unknown>): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { valid: false, errors: ['config must be an object'], warnings };
  }
  const hasUrl = typeof config.worker_url === 'string' || typeof config.base_url === 'string' || typeof config.health_url === 'string';
  if (['own_gpu', 'custom', 'tts', 'ffmpeg', 'github_actions'].includes(providerType) && !hasUrl) {
    errors.push('worker_url, base_url, or health_url is required for this provider.');
  }
  if (['groq', 'gemini'].includes(providerType) && typeof config.api_key !== 'string') {
    errors.push('api_key is required for this provider.');
  }
  if (providerType === 'kaggle' && typeof config.username !== 'string') {
    errors.push('username is required for Kaggle.');
  }
  if (hasUrl) {
    for (const key of ['worker_url', 'base_url', 'health_url']) {
      const value = config[key];
      if (typeof value === 'string' && value && !/^https:\/\//i.test(value) && !/^http:\/\/localhost(?::\d+)?/i.test(value)) {
        warnings.push(`${key} should use HTTPS outside local development.`);
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}
