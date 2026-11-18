import type { FastifyInstance } from 'fastify';
import { animeSupabase } from '../../anime/db/anime.supabase';
import {
  listModelCatalog,
  listRenderProfiles,
  validateModelSelection,
  type ModelPurpose,
} from './modelCatalog';

export default async function modelsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/models/catalog', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const query = (request.query as Record<string, unknown>) || {};
    const capability = typeof query.capability === 'string' ? query.capability : undefined;
    const models = await listModelCatalog(capability);
    return reply.send({
      data: {
        models,
        render_profiles: listRenderProfiles(),
      },
      meta: { request_id: (request as any).anime?.request_id || null },
    });
  });

  fastify.post('/models/select', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = (request.body as Record<string, unknown>) || {};
    const purpose = String(body.purpose || 'primary').trim().toLowerCase() as ModelPurpose;
    const provider = String(body.provider || '').trim().toLowerCase();
    const modelId = String(body.model_id || '').trim();
    const renderProfile = typeof body.render_profile === 'string' ? body.render_profile : null;

    const validation = validateModelSelection({
      purpose,
      provider,
      model_id: modelId,
      render_profile: renderProfile as any,
    });

    if (!validation.valid) {
      const status = validation.error === 'MODEL_INVALID' || validation.error === 'PROFILE_INVALID' ? 422 : 400;
      return reply.code(status).send({
        status: 'failed',
        errors: [{ category: validation.error || 'INVALID_INPUT', message: 'Model selection rejected.' }],
      });
    }

    let stored = false;
    if (request.authContext?.userId) {
      try {
        const { error } = await animeSupabase
          .from('user_model_preferences')
          .upsert({
            user_id: request.authContext.userId,
            purpose,
            provider,
            model_id: modelId,
            render_profile: validation.profile?.key ?? null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,purpose' });
        stored = !error;
      } catch {
        stored = false;
      }
    }

    return reply.send({
      data: {
        stored,
        selection: {
          purpose,
          provider,
          model_id: modelId,
          render_profile: validation.profile?.key ?? null,
        },
        model: validation.model ?? null,
      },
    });
  });

  fastify.get('/models/preferences', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    let preferences: Array<Record<string, unknown>> = [];
    try {
      const { data } = await animeSupabase
        .from('user_model_preferences')
        .select('purpose, provider, model_id, render_profile, updated_at')
        .eq('user_id', request.authContext.userId);
      if (Array.isArray(data)) preferences = data as Array<Record<string, unknown>>;
    } catch {
      preferences = [];
    }
    return reply.send({ data: { preferences } });
  });
}
