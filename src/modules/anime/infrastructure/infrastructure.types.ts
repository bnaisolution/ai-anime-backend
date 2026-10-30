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
  status: 'active' | 'inactive' | 'testing' | 'error';
  is_default: boolean;
  last_verified_at: string | null;
  last_error: string | null;
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
  created_at: string;
  updated_at: string;
}
