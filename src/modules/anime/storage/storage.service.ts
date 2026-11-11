import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { decryptWithKeyVersion } from '../infrastructure/keyRegistry';
import * as infraRepo from '../infrastructure/infrastructure.repo';
import type { InfrastructureRecord } from '../infrastructure/infrastructure.types';
import { putObject } from './storage.adapters';
import type { ResolvedStorage, StorageProviderDefinition, StorageProviderId, StoragePutInput, StoragePutResult } from './storage.types';

const DEFINITIONS: StorageProviderDefinition[] = [
  { id: 'telegram', label: 'Telegram Storage', user_owned_credentials: true, supports_private_objects: true, required_config: ['bot_token', 'storage_chat_id'] },
  { id: 's3_compatible', label: 'S3-Compatible Storage', user_owned_credentials: true, supports_private_objects: true, required_config: ['endpoint', 'bucket', 'region', 'access_key_id', 'secret_access_key'] },
  { id: 'custom_http', label: 'Custom HTTP Storage', user_owned_credentials: true, supports_private_objects: true, required_config: ['upload_url'] },
];

export function listStorageProviders(): StorageProviderDefinition[] {
  return DEFINITIONS.map((definition) => ({ ...definition, required_config: [...definition.required_config] }));
}

export function classifyStorageConfig(config: Record<string, unknown>): { provider: StorageProviderId; config: Record<string, unknown> } | null {
  const declared = String(config.storage_provider || config.provider || '').toLowerCase();
  if (declared === 'telegram' || config.telegram_storage || (config.bot_token && (config.storage_chat_id || config.chat_id))) {
    const nested = (config.telegram_storage && typeof config.telegram_storage === 'object') ? config.telegram_storage as Record<string, unknown> : config;
    return { provider: 'telegram', config: nested };
  }
  if (declared === 's3' || declared === 's3_compatible' || declared === 'r2' || declared === 'minio' || config.s3 || config.bucket) {
    const nested = (config.s3 && typeof config.s3 === 'object') ? config.s3 as Record<string, unknown> : config;
    return { provider: 's3_compatible', config: nested };
  }
  if (declared === 'custom_http' || declared === 'custom_storage' || declared === 'storage' || config.upload_url) {
    const nested = (config.storage && typeof config.storage === 'object') ? config.storage as Record<string, unknown> : config;
    return { provider: 'custom_http', config: nested };
  }
  return null;
}

function configForRecord(record: InfrastructureRecord): { provider: StorageProviderId; config: Record<string, unknown> } | null {
  let config: Record<string, unknown>;
  try { config = JSON.parse(decryptWithKeyVersion(record.config_encrypted, record.key_version)); } catch { return null; }
  return classifyStorageConfig(config);
}

export function selectStorageRecord(records: InfrastructureRecord[], tenantId?: string): ResolvedStorage | null {
  for (const record of records) {
    if (tenantId && record.bound_tenant_id && record.bound_tenant_id !== tenantId) continue;
    const resolved = configForRecord(record);
    if (resolved) {
      return { provider: resolved.provider, record_id: record.id, tenant_id: record.bound_tenant_id ?? null, config: resolved.config };
    }
  }
  return null;
}

export function validateStorageKey(key: string): string {
  if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Storage key must be a relative path without traversal.' });
  }
  return key;
}

export async function resolveStorageForUser(userId: string, tenantId?: string): Promise<ResolvedStorage> {
  const records = await infraRepo.getActiveByUser(userId);
  const resolved = selectStorageRecord(records, tenantId);
  if (resolved) return resolved;
  throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'No user-owned storage provider is configured.' });
}

export async function putForUser(userId: string, input: StoragePutInput, tenantId?: string): Promise<StoragePutResult> {
  validateStorageKey(input.key);
  const resolved = await resolveStorageForUser(userId, tenantId);
  return putObject(resolved.provider, resolved.config, input);
}
