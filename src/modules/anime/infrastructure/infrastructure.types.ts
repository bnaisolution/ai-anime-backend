export type ProviderType =
  | 'kaggle' | 'own_gpu' | 'github_actions'
  | 'groq' | 'gemini' | 'tts'
  | 'ffmpeg' | 'youtube' | 'instagram' | 'custom';

export interface InfrastructureRecord {
  id: string;
  user_id: string;
  name: string;
  provider_type: ProviderType;
  config_encrypted: string;
  capabilities: Record<string, unknown>;
  status: 'active' | 'inactive' | 'testing' | 'error' | 'revoked';
  is_default: boolean;
  last_verified_at: string | null;
  last_error: string | null;
  key_version?: number;
  bound_tenant_id?: string | null;
  last_rotated_at?: string | null;
  revoked_at?: string | null;
  fingerprint?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InfrastructurePublicDto {
  id: string;
  name: string;
  provider_type: ProviderType;
  capabilities: Record<string, unknown>;
  status: string;
  is_default: boolean;
  last_verified_at: string | null;
  last_error: string | null;
  config_masked: Record<string, unknown>;
  key_version: number;
  bound_tenant_id: string | null;
  last_rotated_at: string | null;
  revoked_at: string | null;
  fingerprint: string | null;
  created_at: string;
  updated_at: string;
}
