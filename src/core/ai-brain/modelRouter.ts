import { FastifyInstance } from 'fastify';
import { env } from '../../config/env';

interface LowTpmState {
  windowStart: number;
  usedTokens: number;
  cooldowns: Map<string, number>;
}

const lowTpmState: LowTpmState = {
  windowStart: Date.now(),
  usedTokens: 0,
  cooldowns: new Map(),
};

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || '').length / 4));
}

export function computeBackoffMs(attempt: number, retryAfterMs = 0, random: () => number = Math.random): number {
  const base = Math.min(30000, 500 * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(random() * 250);
  return Math.max(retryAfterMs, base + jitter);
}

export function parseRetryAfterMs(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.floor(seconds * 1000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

export function parseRateLimitResetMs(value: string | null): number {
  if (!value) return 0;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  const unit = (match[2] || 'ms').toLowerCase();
  const multiplier = unit === 'h' ? 3600000 : unit === 'm' ? 60000 : unit === 's' ? 1000 : 1;
  return Math.max(0, Math.floor(amount * multiplier));
}

export function resetLowTpmStateForTests(): void {
  lowTpmState.windowStart = Date.now();
  lowTpmState.usedTokens = 0;
  lowTpmState.cooldowns.clear();
}

function rollBudgetWindow(now: number): void {
  if (now - lowTpmState.windowStart >= 60000) {
    lowTpmState.windowStart = now;
    lowTpmState.usedTokens = 0;
  }
}

export function reserveTokenBudget(tokens: number, now = Date.now()): boolean {
  rollBudgetWindow(now);
  if (!env.LOW_TPM_MODE) return true;
  const requested = Math.max(1, Math.ceil(tokens));
  if (lowTpmState.usedTokens + requested > env.AI_TPM_BUDGET) return false;
  lowTpmState.usedTokens += requested;
  return true;
}

export function recordTokenUsage(tokens: number): void {
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  lowTpmState.usedTokens += Math.ceil(tokens);
}

export function isProviderCoolingDown(provider: string, now = Date.now()): boolean {
  return (lowTpmState.cooldowns.get(provider) || 0) > now;
}

function coolDownProvider(provider: string, durationMs: number): void {
  lowTpmState.cooldowns.set(provider, Date.now() + Math.max(0, durationMs));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function estimateMessageTokens(messages: Array<{ role: string; content: string }>): number {
  return messages.reduce((total, message) => total + estimateTokens(message.content), 0) + messages.length * 4;
}

async function fetchWithBudgetAndBackoff(
  provider: string,
  makeRequest: () => Promise<Response>,
  fastify: FastifyInstance
): Promise<Response | null> {
  let attempt = 0;
  const maxAttempts = Math.max(1, env.AI_MAX_RETRIES + 1);

  while (attempt < maxAttempts) {
    try {
      const response = await makeRequest();
      if (response.ok) {
        const remaining = Number(response.headers.get('x-ratelimit-remaining-tokens'));
        if (Number.isFinite(remaining) && remaining <= 0) {
          const resetMs = parseRateLimitResetMs(response.headers.get('x-ratelimit-reset-tokens'));
          coolDownProvider(provider, resetMs || 60000);
        }
        return response;
      }

      if (response.status === 429 || response.status >= 500) {
        const retryAfterMs =
          parseRetryAfterMs(response.headers.get('retry-after')) ||
          parseRateLimitResetMs(response.headers.get('x-ratelimit-reset-tokens'));
        const cooldownMs = retryAfterMs || computeBackoffMs(attempt);
        coolDownProvider(provider, cooldownMs);
        if (attempt + 1 >= maxAttempts) return response;
        await sleep(computeBackoffMs(attempt, retryAfterMs));
        attempt += 1;
        continue;
      }

      return response;
    } catch (error) {
      fastify.log.warn({ provider, err: error, attempt }, 'Provider request failed');
      if (attempt + 1 >= maxAttempts) return null;
      await sleep(computeBackoffMs(attempt));
      attempt += 1;
    }
  }

  return null;
}

export async function callDynamicModel(
  fastify: FastifyInstance,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  temperature = 0.3
): Promise<{ ok: boolean; reply: string; provider: string; model: string; tokensUsed: number }> {
  const { data: providers } = await fastify.supabase
    .from('provider_configs')
    .select('provider_name, model_default, priority')
    .eq('is_enabled', true)
    .order('priority', { ascending: true });

  const activeProviders = providers || [
    { provider_name: 'groq', model_default: env.GROQ_MODEL, priority: 1 },
    { provider_name: 'gemini', model_default: env.GEMINI_MODEL, priority: 2 }
  ];

  const estimatedInputTokens = estimateMessageTokens(messages);

  for (const p of activeProviders) {
    if (isProviderCoolingDown(p.provider_name)) {
      fastify.log.warn({ provider: p.provider_name }, 'Provider skipped during rate-limit cooldown');
      continue;
    }
    if (!reserveTokenBudget(estimatedInputTokens + 512)) {
      fastify.log.warn({ provider: p.provider_name }, 'Low-TPM budget exhausted; skipping provider');
      break;
    }

    try {
      if (p.provider_name === 'groq' && env.GROQ_API_KEY) {
        const response = await fetchWithBudgetAndBackoff('groq', () => fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: p.model_default, messages, temperature, max_tokens: 4096 }),
          signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS)
        }), fastify);
        if (response?.ok) {
          const data = await response.json() as any;
          const text = data.choices?.[0]?.message?.content?.trim();
          if (text) {
            const tokensUsed = Number(data.usage?.total_tokens) || 500;
            recordTokenUsage(tokensUsed);
            return { ok: true, reply: text, provider: 'groq', model: p.model_default, tokensUsed };
          }
        }
      }

      if (p.provider_name === 'gemini' && env.GEMINI_API_KEY) {
        const sysMsg = messages.find(m => m.role === 'system')?.content || '';
        const contents = messages.filter(m => m.role !== 'system').map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${p.model_default}:generateContent`;
        const response = await fetchWithBudgetAndBackoff('gemini', () => fetch(url, {
          method: 'POST',
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents, systemInstruction: sysMsg ? { parts: [{ text: sysMsg }] } : undefined, generationConfig: { temperature, maxOutputTokens: 4096 } }),
          signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS)
        }), fastify);
        if (response?.ok) {
          const data = await response.json() as any;
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            const tokensUsed = Number(data.usageMetadata?.totalTokenCount) || 600;
            recordTokenUsage(tokensUsed);
            return { ok: true, reply: text, provider: 'gemini', model: p.model_default, tokensUsed };
          }
        }
      }
    } catch (_e) {
      fastify.log.warn({ provider: p.provider_name, err: _e }, 'Provider call failed, falling back...');
    }
  }
  return { ok: false, reply: '', provider: 'none', model: 'none', tokensUsed: 0 };
}

export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!env.GEMINI_API_KEY) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${env.GEMINI_API_KEY}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] } }),
      signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS)
    });
    if (resp.ok) {
      const data = await resp.json() as any;
      return data.embedding?.values || null;
    }
  } catch (_e) {}
  return null;
}
