import { writeAudit } from '../audit/audit.writer';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { decryptConfig, encryptConfig, maskConfig } from './infrastructure.crypto';
import * as repo from './infrastructure.repo';
import type { InfrastructurePublicDto, InfrastructureRecord, ProviderType } from './infrastructure.types';

function masterKey(): string {
  const k = process.env.ANIME_ENCRYPTION_KEY;
  if (!k || k.length < 32) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'ANIME_ENCRYPTION_KEY missing or too short' });
  return k;
}

function toPublic(r: InfrastructureRecord): InfrastructurePublicDto {
  let cfg: Record<string, unknown> = {};
  try { cfg = JSON.parse(decryptConfig(r.config_encrypted, masterKey())); } catch { cfg = { error: 'decrypt_failed' }; }
  return {
    id: r.id, name: r.name, provider_type: r.provider_type,
    capabilities: r.capabilities, status: r.status,
    is_default: r.is_default, last_verified_at: r.last_verified_at,
    last_error: r.last_error, config_masked: maskConfig(cfg),
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

export async function create(userId: string, input: {
  name: string; provider_type: ProviderType; config: Record<string, unknown>;
  capabilities?: Record<string, unknown>; is_default?: boolean; request_id?: string;
}): Promise<InfrastructurePublicDto> {
  const record = await repo.insert({
    user_id: userId, name: input.name, provider_type: input.provider_type,
    config_encrypted: encryptConfig(JSON.stringify(input.config), masterKey()),
    capabilities: input.capabilities ?? {}, is_default: input.is_default ?? false,
  });
  await writeAudit({ project_id: null, user_id: userId, workflow_name: 'INFRASTRUCTURE', action: 'CREATE_INFRASTRUCTURE', entity_type: 'USER_INFRASTRUCTURE', entity_id: record.id, new_value: { name: record.name, provider_type: record.provider_type }, request_id: input.request_id });
  return toPublic(record);
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
  if (patch.config !== undefined) dbPatch.config_encrypted = encryptConfig(JSON.stringify(patch.config), masterKey());
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
  const cfg = JSON.parse(decryptConfig(r.config_encrypted, masterKey())) as Record<string, any>;
  let ok = false; let errMsg: string | null = null;
  const healthUrl = cfg.health_url || (cfg.worker_url ? `${String(cfg.worker_url).replace(/\/$/, '')}/health` : null) || (cfg.base_url ? `${String(cfg.base_url).replace(/\/$/, '')}/health` : null);
  if (healthUrl) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(healthUrl, { signal: ctrl.signal });
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
    try { out[r.provider_type] = JSON.parse(decryptConfig(r.config_encrypted, masterKey())); } catch { /* skip corrupt */ }
  }
  return out;
}
