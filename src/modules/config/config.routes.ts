import { FastifyInstance } from 'fastify';
import { decryptWithKeyVersion, encryptWithCurrentKey } from '../anime/infrastructure/keyRegistry';
import { maskConfig } from '../anime/infrastructure/infrastructure.crypto';

const SECRET_KEY_RE = /(token|key|secret|password|api_key|refresh|credential)/i;

function sealProviderConfig(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  for (const [key, value] of Object.entries(input)) {
    if (!SECRET_KEY_RE.test(key) || typeof value !== 'string' || value.length === 0) continue;
    const encrypted = encryptWithCurrentKey(value);
    delete out[key];
    out[`${key}_encrypted`] = encrypted.ciphertext;
    out[`${key}_key_version`] = encrypted.key_version;
    out[`${key}_configured`] = true;
  }
  return out;
}

function safeProviderView(row: Record<string, unknown>, includeConfig: boolean): Record<string, unknown> {
  const rawConfig = row.config && typeof row.config === 'object' && !Array.isArray(row.config)
    ? row.config as Record<string, unknown>
    : {};
  const base: Record<string, unknown> = {
    id: row.id,
    provider_name: row.provider_name,
    model_default: row.model_default,
    priority: row.priority,
    is_enabled: row.is_enabled,
    secret_configured: Object.keys(rawConfig).some((key) => SECRET_KEY_RE.test(key) || key.endsWith('_configured')),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (includeConfig) {
    const plainConfig: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawConfig)) {
      if (key.endsWith('_encrypted')) continue;
      plainConfig[key] = value;
    }
    base.config = maskConfig(plainConfig);
  }
  return base;
}

function decryptByoiConfig(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  const raw = config as Record<string, unknown>;
  if (typeof raw.encrypted_config !== 'string') return raw;
  try {
    const decrypted = decryptWithKeyVersion(raw.encrypted_config, Number(raw.key_version) || undefined);
    const parsed = JSON.parse(decrypted);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return { error: 'decrypt_failed' };
  }
}

export default async function configRoutes(fastify: FastifyInstance) {
  fastify.get('/ai-models', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { data, error } = await fastify.supabase
      .from('provider_configs')
      .select('id, provider_name, model_default, priority, is_enabled, config, created_at, updated_at')
      .order('priority', { ascending: true });
    if (error) return reply.code(500).send({ error: 'Unable to load model catalog' });
    const isOwner = request.authContext?.role === 'owner_admin';
    return reply.send({
      status: 'completed',
      models: (data || []).map((row: Record<string, unknown>) => safeProviderView(row, isOwner))
    });
  });

  fastify.post('/ai-models/update', { preHandler: [fastify.authenticate, fastify.requireOwner] }, async (request, reply) => {
    try {
      const body = request.body as any;
      if (body.id) {
        const updates: any = {};
        if (body.priority !== undefined) updates.priority = body.priority;
        if (body.is_enabled !== undefined) updates.is_enabled = body.is_enabled;
        if (body.model_default) updates.model_default = body.model_default;
        if (body.config) updates.config = sealProviderConfig(body.config as Record<string, unknown>);
        if (body.api_key) updates.config = sealProviderConfig({ ...(body.config || {}), api_key: body.api_key } as Record<string, unknown>);
        await fastify.supabase.from('provider_configs').update(updates).eq('id', body.id);
        return reply.send({ status: 'completed' });
      } else if (body.provider_name && body.model_default) {
        const config: Record<string, unknown> = { ...(body.config || {}) };
        if (body.api_key) config.api_key = body.api_key;
        if (body.base_url) config.base_url = body.base_url;
        await fastify.supabase.from('provider_configs').insert({
          provider_name: body.provider_name,
          model_default: body.model_default,
          priority: body.priority || 3,
          is_enabled: true,
          config: sealProviderConfig(config)
        });
        return reply.send({ status: 'completed' });
      }
      return reply.code(400).send({ status: 'failed', message: 'Invalid payload' });
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  fastify.get('/prompts', { preHandler: [fastify.authenticate, fastify.requireOwner] }, async (request, reply) => {
    const { data, error } = await fastify.supabase.from('prompt_versions').select('*').order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ status: 'completed', prompts: data || [] });
  });

  fastify.post('/prompts/update', { preHandler: [fastify.authenticate, fastify.requireOwner] }, async (request, reply) => {
    try {
      const body = request.body as any;
      await fastify.supabase.from('prompt_versions').update({ is_active: false }).eq('name', body.name);
      const { error } = await fastify.supabase.from('prompt_versions').insert({
        name: body.name,
        version: Date.now().toString(),
        content: body.content,
        is_active: true
      });
      if (error) throw new Error(error.message);
      return reply.send({ status: 'completed' });
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  fastify.get('/byoi', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { data, error } = await fastify.supabase.from('user_integrations').select('*').eq('user_id', request.authContext.userId).eq('integration_type', 'custom_llm').maybeSingle();
    if (error) return reply.code(500).send({ error: 'Unable to load BYOI configuration' });
    const config = decryptByoiConfig(data?.config);
    return reply.send({
      status: 'completed',
      byoi: data
        ? { id: data.id, integration_type: data.integration_type, config: maskConfig(config), updated_at: data.updated_at }
        : null
    });
  });

  fastify.post('/byoi/update', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      if (!body.config || typeof body.config !== 'object' || Array.isArray(body.config)) {
        return reply.code(400).send({ status: 'failed', message: 'config object is required' });
      }
      const userId = request.authContext.userId;
      const encrypted = encryptWithCurrentKey(JSON.stringify(body.config));
      const storedConfig = {
        encrypted_config: encrypted.ciphertext,
        key_version: encrypted.key_version,
        configured_at: new Date().toISOString(),
      };
      const { data: existing } = await fastify.supabase.from('user_integrations').select('id').eq('user_id', userId).eq('integration_type', 'custom_llm').maybeSingle();

      if (existing) {
        await fastify.supabase.from('user_integrations').update({ config: storedConfig }).eq('id', existing.id);
      } else {
        await fastify.supabase.from('user_integrations').insert({ user_id: userId, integration_type: 'custom_llm', config: storedConfig });
      }
      return reply.send({ status: 'completed' });
    } catch (_e: any) {
      return reply.code(500).send({ error: 'Unable to save BYOI configuration' });
    }
  });
}
