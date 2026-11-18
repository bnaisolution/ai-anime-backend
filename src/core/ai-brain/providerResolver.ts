import { env } from '../../config/env';
import {
  getActiveDecryptedInfrastructureForUser,
  type DecryptedInfrastructure,
} from '../../modules/anime/infrastructure/infrastructure.service';

export type AiCapability = 'text' | 'vision' | 'embedding';
export type ByodProviderName = 'groq' | 'gemini' | 'custom';

export interface ByodProviderCandidate {
  readonly provider: ByodProviderName;
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl: string | null;
  readonly chatPath: string;
  readonly embeddingModel: string;
  readonly infrastructureId: string;
  readonly infrastructureName: string;
  readonly isDefault: boolean;
  readonly keySource: 'byod';
  readonly keyVersion: number;
}

export interface ByodResolution {
  readonly candidates: ByodProviderCandidate[];
  readonly reason: 'OK' | 'BYOD_NOT_CONFIGURED' | 'UNSUPPORTED_PROVIDER';
  readonly availableProviders: string[];
}

interface ResolveOptions {
  capability?: AiCapability;
  tenantId?: string;
}

const DEFAULT_MODELS: Record<ByodProviderName, string> = {
  groq: env.GROQ_MODEL,
  gemini: env.GEMINI_MODEL,
  custom: '',
};

const PROVIDER_PRIORITY: Record<string, number> = {
  groq: 10,
  gemini: 20,
  custom: 30,
};

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProvider(providerType: string): ByodProviderName | null {
  const normalized = providerType.trim().toLowerCase();
  if (normalized === 'groq') return 'groq';
  if (normalized === 'gemini') return 'gemini';
  if (normalized === 'openai' || normalized === 'openai_compatible' || normalized === 'custom') return 'custom';
  return null;
}

function providerSupports(provider: ByodProviderName, capability: AiCapability, capabilities: Record<string, unknown>): boolean {
  if (capability === 'text') return true;
  if (capability === 'vision') {
    if (provider === 'gemini') return true;
    const declared = capabilities.vision ?? capabilities.images ?? capabilities.multimodal;
    return declared === true;
  }
  if (capability === 'embedding') {
    if (provider === 'gemini') return true;
    return capabilities.embeddings === true;
  }
  return false;
}

export function isSafeProviderBaseUrl(raw: string): boolean {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();
  if (host === '169.254.169.254' || host === 'metadata.google.internal') return false;
  if (url.protocol === 'http:') {
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.internal');
  }
  return true;
}

export function joinChatCompletionsUrl(baseUrl: string, chatPath = ''): string {
  const base = baseUrl.replace(/\/+$/, '');
  const explicit = chatPath.trim();
  if (explicit) return explicit.startsWith('http') ? explicit : `${base}/${explicit.replace(/^\/+/, '')}`;
  if (/\/v1$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function candidateFromRecord(record: DecryptedInfrastructure): ByodProviderCandidate | null {
  const provider = normalizeProvider(record.provider_type);
  if (!provider) return null;
  const config = record.config ?? {};
  const apiKey = stringValue(config.api_key) || stringValue(config.apiKey) || stringValue(config.token);
  if (!apiKey) return null;
  const model = stringValue(config.model_default) || stringValue(config.model) || DEFAULT_MODELS[provider];
  if (!model) return null;
  const rawBase = stringValue(config.base_url) || stringValue(config.baseUrl);
  const baseUrl = rawBase && isSafeProviderBaseUrl(rawBase) ? rawBase : null;
  if (provider === 'custom' && !baseUrl) return null;
  return {
    provider,
    model,
    apiKey,
    baseUrl,
    chatPath: stringValue(config.chat_path) || stringValue(config.chatPath),
    embeddingModel: stringValue(config.embedding_model) || stringValue(config.embeddingModel)
      || (provider === 'gemini' ? 'text-embedding-004' : ''),
    infrastructureId: record.id,
    infrastructureName: record.name,
    isDefault: record.is_default,
    keySource: 'byod',
    keyVersion: Number(record.key_version) || 1,
  };
}

export async function resolveByodProviderCandidates(
  userId: string,
  options: ResolveOptions = {}
): Promise<ByodResolution> {
  const capability = options.capability ?? 'text';
  const records = await getActiveDecryptedInfrastructureForUser(userId, options.tenantId);
  const seen = new Set<string>();
  const candidates: ByodProviderCandidate[] = [];
  const availableProviders: string[] = [];

  for (const record of records) {
    const provider = normalizeProvider(record.provider_type);
    if (!provider) continue;
    if (!availableProviders.includes(provider)) availableProviders.push(provider);
    if (!providerSupports(provider, capability, record.capabilities)) continue;
    const candidate = candidateFromRecord(record);
    if (!candidate) continue;
    const dedupeKey = `${candidate.provider}:${candidate.model}:${candidate.baseUrl ?? ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    candidates.push(candidate);
  }

  candidates.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return (PROVIDER_PRIORITY[a.provider] ?? 99) - (PROVIDER_PRIORITY[b.provider] ?? 99);
  });

  if (candidates.length > 0) return { candidates, reason: 'OK', availableProviders };
  return {
    candidates: [],
    reason: availableProviders.length === 0 ? 'BYOD_NOT_CONFIGURED' : 'UNSUPPORTED_PROVIDER',
    availableProviders,
  };
}

export function describeByodProviders(availableProviders: string[]): string {
  if (availableProviders.length === 0) {
    return 'No BYOD AI provider is configured for this account. Add a Groq, Gemini, or OpenAI-compatible provider in Settings.';
  }
  return `Configured BYOD providers do not support this capability (${availableProviders.join(', ')}).`;
}
