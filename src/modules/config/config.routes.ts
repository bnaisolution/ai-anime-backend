import { FastifyInstance } from 'fastify';

export default async function configRoutes(fastify: FastifyInstance) {
  fastify.get('/ai-models', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { data, error } = await fastify.supabase.from('provider_configs').select('*').order('priority', { ascending: true });
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ status: 'completed', models: data || [] });
  });

  fastify.post('/ai-models/update', { preHandler: [fastify.authenticate, fastify.requireOwner] }, async (request, reply) => {
    try {
      const body = request.body as any;
      if (body.id) {
        const updates: any = {};
        if (body.priority !== undefined) updates.priority = body.priority;
        if (body.is_enabled !== undefined) updates.is_enabled = body.is_enabled;
        if (body.model_default) updates.model_default = body.model_default;
        if (body.config) updates.config = body.config;
        await fastify.supabase.from('provider_configs').update(updates).eq('id', body.id);
        return reply.send({ status: 'completed' });
      } else if (body.provider_name && body.model_default) {
        const config: any = body.config || {};
        if (body.api_key) config.api_key = body.api_key;
        if (body.base_url) config.base_url = body.base_url;
        await fastify.supabase.from('provider_configs').insert({
          provider_name: body.provider_name,
          model_default: body.model_default,
          priority: body.priority || 3,
          is_enabled: true,
          config: config
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

  fastify.get('/byoi', { preHandler: [fastify.authenticate, fastify.requireOwner] }, async (request, reply) => {
    const { data, error } = await fastify.supabase.from('user_integrations').select('*').eq('user_id', request.authContext.userId).eq('integration_type', 'custom_llm').maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ status: 'completed', byoi: data || null });
  });

  fastify.post('/byoi/update', { preHandler: [fastify.authenticate, fastify.requireOwner] }, async (request, reply) => {
    try {
      const body = request.body as any;
      const userId = request.authContext.userId;
      const { data: existing } = await fastify.supabase.from('user_integrations').select('id').eq('user_id', userId).eq('integration_type', 'custom_llm').maybeSingle();

      if (existing) {
        await fastify.supabase.from('user_integrations').update({ config: body.config }).eq('id', existing.id);
      } else {
        await fastify.supabase.from('user_integrations').insert({ user_id: userId, integration_type: 'custom_llm', config: body.config });
      }
      return reply.send({ status: 'completed' });
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });
}
