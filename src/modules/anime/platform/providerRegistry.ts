import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export type ProviderCategory = 'ai' | 'gpu' | 'cpu' | 'storage' | 'database';
export type ProviderTask = 'chat' | 'embedding' | 'image' | 'video' | 'animation' | 'lipsync' | 'voice' | 'ffmpeg' | 'storage' | 'database';
export type ProviderBilling = 'none' | 'user' | 'platform';

export interface ProviderDefinition {
  id: string;
  category: ProviderCategory;
  label: string;
  billing: ProviderBilling;
  requires_credentials: boolean;
  db_provider_types: string[];
  aliases: string[];
  tasks: ProviderTask[];
}

const PROVIDERS: ProviderDefinition[] = [
  { id: 'groq', category: 'ai', label: 'Groq', billing: 'user', requires_credentials: true, db_provider_types: ['groq'], aliases: ['groq', 'groq_cloud'], tasks: ['chat'] },
  { id: 'gemini', category: 'ai', label: 'Google Gemini', billing: 'user', requires_credentials: true, db_provider_types: ['gemini'], aliases: ['gemini', 'google', 'google_gemini'], tasks: ['chat', 'embedding'] },
  { id: 'nvidia_nim', category: 'ai', label: 'NVIDIA NIM', billing: 'user', requires_credentials: true, db_provider_types: ['custom'], aliases: ['nvidia', 'nvidia_nim', 'nim'], tasks: ['chat', 'embedding'] },
  { id: 'openai_compatible', category: 'ai', label: 'OpenAI-Compatible API', billing: 'user', requires_credentials: true, db_provider_types: ['custom'], aliases: ['openai', 'openai_compatible', 'compatible', 'openai_api'], tasks: ['chat', 'embedding'] },
  { id: 'kaggle', category: 'gpu', label: 'Kaggle GPU', billing: 'user', requires_credentials: true, db_provider_types: ['kaggle'], aliases: ['kaggle', 'kaggle_gpu'], tasks: ['image', 'video', 'animation', 'lipsync', 'voice'] },
  { id: 'colab', category: 'gpu', label: 'Google Colab GPU', billing: 'user', requires_credentials: true, db_provider_types: ['custom'], aliases: ['colab', 'google_colab'], tasks: ['image', 'video', 'animation', 'lipsync', 'voice'] },
  { id: 'lightning_ai', category: 'gpu', label: 'Lightning AI GPU', billing: 'user', requires_credentials: true, db_provider_types: ['custom'], aliases: ['lightning', 'lightning_ai'], tasks: ['image', 'video', 'animation', 'lipsync', 'voice'] },
  { id: 'paid_gpu', category: 'gpu', label: 'Paid GPU Provider', billing: 'user', requires_credentials: true, db_provider_types: ['custom', 'own_gpu'], aliases: ['paid_gpu', 'runpod', 'vast', 'lambda'], tasks: ['image', 'video', 'animation', 'lipsync', 'voice'] },
  { id: 'custom_gpu', category: 'gpu', label: 'Custom GPU Worker', billing: 'user', requires_credentials: true, db_provider_types: ['own_gpu', 'custom'], aliases: ['custom_gpu', 'own_gpu', 'custom'], tasks: ['image', 'video', 'animation', 'lipsync', 'voice'] },
  { id: 'github_actions', category: 'cpu', label: 'GitHub Actions CPU', billing: 'user', requires_credentials: true, db_provider_types: ['github_actions'], aliases: ['github', 'github_actions', 'github_cpu'], tasks: ['voice', 'ffmpeg'] },
  { id: 'vps', category: 'cpu', label: 'VPS CPU Worker', billing: 'user', requires_credentials: true, db_provider_types: ['custom'], aliases: ['vps', 'vps_cpu', 'custom_cpu'], tasks: ['voice', 'ffmpeg'] },
  { id: 'custom_cpu', category: 'cpu', label: 'Custom CPU Worker', billing: 'user', requires_credentials: true, db_provider_types: ['custom', 'ffmpeg', 'tts'], aliases: ['custom_cpu', 'ffmpeg', 'tts'], tasks: ['voice', 'ffmpeg'] },
  { id: 'telegram', category: 'storage', label: 'Telegram Storage', billing: 'user', requires_credentials: true, db_provider_types: ['custom', 'instagram'], aliases: ['telegram', 'telegram_storage'], tasks: ['storage'] },
  { id: 's3_compatible', category: 'storage', label: 'S3-Compatible Storage', billing: 'user', requires_credentials: true, db_provider_types: ['custom'], aliases: ['s3', 's3_compatible', 'r2', 'minio'], tasks: ['storage'] },
  { id: 'custom_storage', category: 'storage', label: 'Custom Storage', billing: 'user', requires_credentials: true, db_provider_types: ['custom'], aliases: ['custom_storage', 'storage'], tasks: ['storage'] },
  { id: 'database_primary', category: 'database', label: 'Primary Database', billing: 'none', requires_credentials: false, db_provider_types: ['custom'], aliases: ['primary', 'database_primary', 'supabase'], tasks: ['database'] },
  { id: 'database_secondary', category: 'database', label: 'Secondary Database', billing: 'user', requires_credentials: true, db_provider_types: ['custom'], aliases: ['secondary', 'database_secondary', 'replica'], tasks: ['database'] },
];

const BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

export function listProviders(category?: ProviderCategory): ProviderDefinition[] {
  return PROVIDERS.filter((provider) => !category || provider.category === category);
}

export function getProvider(id: string): ProviderDefinition | null {
  return BY_ID.get(String(id || '').trim().toLowerCase()) ?? null;
}

export function resolveProviderDefinition(providerType: string, config: Record<string, unknown> = {}): ProviderDefinition | null {
  const requested = [config.provider_id, config.provider, config.vendor, config.provider_type, providerType]
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .find(Boolean);
  if (requested && requested !== 'custom') {
    for (const provider of PROVIDERS) {
      if (provider.id === requested || provider.aliases.includes(requested)) return provider;
    }
  }
  const dbType = String(providerType || '').trim().toLowerCase();
  const matches = PROVIDERS.filter((provider) => provider.db_provider_types.includes(dbType));
  if (dbType === 'custom') {
    const capabilities = (config.capabilities ?? {}) as Record<string, unknown>;
    if (capabilities.requires_gpu === true || config.requires_gpu === true) return BY_ID.get('custom_gpu') ?? null;
    if (config.storage_url || config.bucket || config.bucket_name) return BY_ID.get('custom_storage') ?? null;
    return BY_ID.get('custom_cpu') ?? null;
  }
  return matches[0] ?? null;
}

export function assertProviderSupportsTask(providerId: string, task: ProviderTask): ProviderDefinition {
  const provider = getProvider(providerId);
  if (!provider) throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: `Unknown provider ${providerId}.` });
  if (!provider.tasks.includes(task)) {
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: `${provider.label} does not support ${task}.` });
  }
  return provider;
}

export function providerRequiresPaidApproval(provider: ProviderDefinition): boolean {
  return provider.billing === 'platform';
}
