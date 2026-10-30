import { FastifyInstance } from 'fastify';
import { env } from '../../config/env';

export async function callDynamicModel(
  fastify: FastifyInstance,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  temperature = 0.3
): Promise<{ ok: boolean; reply: string; provider: string; model: string; tokensUsed: number }> {
  // Fetch active providers from DB, ordered by priority
  const { data: providers } = await fastify.supabase
    .from('provider_configs')
    .select('provider_name, model_default, priority')
    .eq('is_enabled', true)
    .order('priority', { ascending: true });

  const activeProviders = providers || [
    { provider_name: 'groq', model_default: env.GROQ_MODEL, priority: 1 },
    { provider_name: 'gemini', model_default: env.GEMINI_MODEL, priority: 2 }
  ];

  for (const p of activeProviders) {
    try {
      if (p.provider_name === 'groq' && env.GROQ_API_KEY) {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: p.model_default, messages, temperature, max_tokens: 4096 })
        });
        if (resp.ok) {
          const data = await resp.json() as any;
          const text = data.choices?.[0]?.message?.content?.trim();
          if (text) return { ok: true, reply: text, provider: 'groq', model: p.model_default, tokensUsed: data.usage?.total_tokens || 500 };
        }
      }

      if (p.provider_name === 'gemini' && env.GEMINI_API_KEY) {
        const sysMsg = messages.find(m => m.role === 'system')?.content || '';
        const contents = messages.filter(m => m.role !== 'system').map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${p.model_default}:generateContent`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents, systemInstruction: sysMsg ? { parts: [{ text: sysMsg }] } : undefined, generationConfig: { temperature, maxOutputTokens: 4096 } })
        });
        if (resp.ok) {
          const data = await resp.json() as any;
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) return { ok: true, reply: text, provider: 'gemini', model: p.model_default, tokensUsed: 600 };
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
      body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] } })
    });
    if (resp.ok) {
      const data = await resp.json() as any;
      return data.embedding?.values || null;
    }
  } catch (_e) {}
  return null;
}
