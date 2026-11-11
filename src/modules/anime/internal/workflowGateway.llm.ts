import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

type ProviderName = 'groq' | 'gemini' | 'openai';
const PROVIDERS: Record<ProviderName, { base: string; prefix: string; keyEnv: string; mode: 'bearer' | 'gemini' }> = {
  groq: { base: 'https://api.groq.com', prefix: '/openai/v1/', keyEnv: 'GROQ_API_KEY', mode: 'bearer' },
  gemini: { base: 'https://generativelanguage.googleapis.com', prefix: '/v1beta/', keyEnv: 'GEMINI_API_KEY', mode: 'gemini' },
  openai: { base: 'https://api.openai.com', prefix: '/v1/', keyEnv: 'OPENAI_API_KEY', mode: 'bearer' },
};

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
}

export function buildProviderRequest(input: { provider: string; path: string; body: unknown; env?: NodeJS.ProcessEnv }): ProviderRequest {
  const provider = String(input.provider || '').toLowerCase() as ProviderName;
  const config = PROVIDERS[provider];
  if (!config) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Unsupported LLM provider.' });
  const path = String(input.path || '');
  if (!path.startsWith(config.prefix) || path.includes('..') || path.includes('//') || path.includes('http')) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'LLM provider path is not allowed.' });
  }
  if (!input.body || typeof input.body !== 'object' || Array.isArray(input.body)) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'LLM request body must be an object.' });
  }
  const env = input.env ?? process.env;
  const apiKey = String(env[config.keyEnv] || '').trim();
  if (!apiKey) throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: `Provider ${provider} is not configured.`, retryable: false });
  const url = new URL(`${config.base}${path}`);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.mode === 'gemini' && path.includes(':generateContent')) {
    url.searchParams.delete('key');
    url.searchParams.set('key', apiKey);
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return { url: url.toString(), headers };
}
