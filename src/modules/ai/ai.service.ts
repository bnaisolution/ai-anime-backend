import { FastifyInstance } from 'fastify';
import { env } from '../../config/env';
import { redactSecrets } from '../../security/permissionEngine';
import crypto from 'crypto';

export interface ModelResponse { ok: boolean; reply: string; provider: string; model: string; tokens: number; }

export async function callModel(messages: any[], fastify: FastifyInstance, userId: string): Promise<ModelResponse> {
    const { data: byoi } = await fastify.supabase.from('user_integrations').select('config').eq('user_id', userId).eq('integration_type', 'custom_llm').maybeSingle();
    const byoiConfig = byoi?.config as any;

    if (byoiConfig?.api_key && byoiConfig?.endpoint) {
        try {
            const resp = await fetch(String(byoiConfig.endpoint), { method: 'POST', headers: { Authorization: `Bearer ${String(byoiConfig.api_key)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: String(byoiConfig.model || 'gpt-3.5-turbo'), messages, temperature: 0.3 }) });
            if (resp.ok) {
                const data: any = await resp.json();
                const reply = String(redactSecrets(String(data.choices?.[0]?.message?.content || '')));
                const tokens = Number(data.usage?.total_tokens) || 0;
                await fastify.supabase.from('execution_records').insert({ task_id: crypto.randomUUID(), execution_type: 'byoi_chat', provider: 'byoi', model: String(byoiConfig.model), input: { message_length: messages[messages.length-1].content.length }, output: { reply_length: reply.length }, success: true, tokens_used: tokens });
                return { ok: true, reply, provider: 'byoi', model: String(byoiConfig.model), tokens };
            }
        } catch (e) {}
    }

    const { data: activeModels } = await fastify.supabase.from('provider_configs').select('*').eq('is_enabled', true).order('priority', { ascending: true });
    const modelsToTry = activeModels || [];

    for (const activeModel of modelsToTry) {
        const provider = String(activeModel.provider_name);
        const config = activeModel.config || {};
        const apiKey = config.api_key || (provider === 'groq' ? env.GROQ_API_KEY : provider === 'gemini' ? env.GEMINI_API_KEY : '');
        const baseUrl = config.base_url || (provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent' : '');

        if (!apiKey || !baseUrl) continue;

        try {
            let body: any = { model: String(activeModel.model_default), messages, temperature: 0.3 };
            let headers: any = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

            if (provider === 'gemini') {
                const sysMsg = messages.find((m: any) => m.role === 'system')?.content || '';
                const contents = messages.filter((m: any) => m.role !== 'system').map((m: any) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));
                body = { contents, systemInstruction: sysMsg ? { parts: [{ text: String(sysMsg) }] } : undefined, generationConfig: { temperature: 0.3, maxOutputTokens: 2048 } };
                headers = { 'x-goog-api-key': String(apiKey), 'Content-Type': 'application/json' };
            }

            const resp = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(body) });
            if (resp.ok) {
                const data: any = await resp.json();
                const reply = provider === 'gemini' ? String(data.candidates?.[0]?.content?.parts?.[0]?.text || '') : String(data.choices?.[0]?.message?.content || '');
                const tokens = Number(data.usage?.total_tokens) || 0;
                const cleanReply = String(redactSecrets(reply));
                await fastify.supabase.from('execution_records').insert({ task_id: crypto.randomUUID(), execution_type: 'router_chat', provider, model: String(activeModel.model_default), input: { message_length: messages[messages.length-1].content.length }, output: { reply_length: cleanReply.length }, success: true, tokens_used: tokens });
                return { ok: true, reply: cleanReply, provider, model: String(activeModel.model_default), tokens };
            }
        } catch (e) {}
    }
    return { ok: false, reply: '', provider: 'none', model: 'none', tokens: 0 };
}
