export type StorageProviderId = 'telegram' | 's3_compatible' | 'custom_http';

export interface StoragePutInput {
  key: string;
  filename: string;
  content_type: string;
  data: Buffer;
  metadata?: Record<string, string>;
}

export interface StoragePutResult {
  provider: StorageProviderId;
  key: string;
  bytes: number;
  sha256: string;
  remote_id: string | null;
  url: string | null;
}

export interface ResolvedStorage {
  provider: StorageProviderId;
  record_id: string;
  tenant_id: string | null;
  config: Record<string, unknown>;
}

export interface StorageProviderDefinition {
  id: StorageProviderId;
  label: string;
  user_owned_credentials: true;
  supports_private_objects: boolean;
  required_config: string[];
}
