import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

const READ_ROLES = ['owner', 'admin', 'editor', 'reviewer', 'viewer'];
const WRITE_ROLES = ['owner', 'admin', 'editor'];

const ProjParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
});

const CharRefParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  cid: Type.String({ minLength: 1 }),
});

export async function registerAnimeLoreRoutes(app: FastifyInstance): Promise<void> {
  // 1. GET /v1/anime/projects/:id/quota
  app.get(
    '/v1/anime/projects/:id/quota',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const projectId = request.params.id;
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const { data, error } = await animeSupabase
        .from('quota_usage')
        .select('*')
        .eq('project_id', projectId)
        .gte('usage_date', yesterday)
        .order('usage_date', { ascending: false });

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch quota usage', cause: error });
      }
      const rows = data ?? [];
      return {
        data: {
          project_id: projectId,
          since_date: yesterday,
          records_count: rows.length,
          daily_limit: Number(process.env.DAILY_QUOTA_LIMIT || 5000),
          latest: rows[0] ?? null,
          items: rows,
        },
      };
    }
  );

  // 2. GET /v1/anime/projects/:id/continuity
  app.get(
    '/v1/anime/projects/:id/continuity',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('continuity_checks')
        .select('*')
        .eq('project_id', request.params.id)
        .order('checked_at', { ascending: false });

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch continuity checks', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 3. GET /v1/anime/projects/:id/retries
  app.get(
    '/v1/anime/projects/:id/retries',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('pending_actions')
        .select('*')
        .eq('project_id', request.params.id)
        .in('status', ['FAILED', 'RETRY_SCHEDULED', 'DEAD_LETTER'])
        .order('ready_at', { ascending: true });

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch retries', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 4. GET /v1/anime/projects/:id/characters/:cid/reference-history
  app.get(
    '/v1/anime/projects/:id/characters/:cid/reference-history',
    { schema: { params: CharRefParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { id: projectId, cid } = request.params;
      const { data, error } = await animeSupabase
        .from('character_reference_history')
        .select('*')
        .eq('project_id', projectId)
        .eq('character_code', cid)
        .order('created_at', { ascending: false });

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch character reference history', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 5. GET /v1/anime/projects/:id/character-knowledge
  app.get(
    '/v1/anime/projects/:id/character-knowledge',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('character_knowledge')
        .select('*')
        .eq('project_id', request.params.id);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch character knowledge', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 6. GET /v1/anime/projects/:id/mysteries
  app.get(
    '/v1/anime/projects/:id/mysteries',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('mystery_tracker')
        .select('*')
        .eq('project_id', request.params.id)
        .in('status', ['OPEN', 'PARTIAL', 'ACTIVE', 'RESOLVED']);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch mysteries', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 7. GET /v1/anime/projects/:id/arcs
  app.get(
    '/v1/anime/projects/:id/arcs',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('character_arcs')
        .select('*')
        .eq('project_id', request.params.id);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch character arcs', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 8. GET /v1/anime/projects/:id/powers
  app.get(
    '/v1/anime/projects/:id/powers',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('power_system')
        .select('*')
        .eq('project_id', request.params.id);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch power system', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 9. GET /v1/anime/projects/:id/locations
  app.get(
    '/v1/anime/projects/:id/locations',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('locations')
        .select('*')
        .eq('project_id', request.params.id);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch locations', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 10. GET /v1/anime/projects/:id/artifacts
  app.get(
    '/v1/anime/projects/:id/artifacts',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('artifacts')
        .select('*')
        .eq('project_id', request.params.id);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch artifacts', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 11. GET /v1/anime/projects/:id/rules
  app.get(
    '/v1/anime/projects/:id/rules',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('story_rules')
        .select('*')
        .eq('project_id', request.params.id)
        .eq('active', true);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch story rules', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 12. GET /v1/anime/projects/:id/voices
  app.get(
    '/v1/anime/projects/:id/voices',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async () => {
      const { data, error } = await animeSupabase
        .from('voice_catalog')
        .select('*')
        .eq('is_active', true);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch voice catalog', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 13. GET /v1/anime/projects/:id/foreshadowing
  app.get(
    '/v1/anime/projects/:id/foreshadowing',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('foreshadowing')
        .select('*')
        .eq('project_id', request.params.id)
        .eq('status', 'active');

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch foreshadowing', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 14. GET /v1/anime/projects/:id/character-status
  app.get(
    '/v1/anime/projects/:id/character-status',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('character_status')
        .select('*')
        .eq('project_id', request.params.id)
        .order('character_code', { ascending: true });

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch character status', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 15. GET /v1/anime/projects/:id/relationships
  app.get(
    '/v1/anime/projects/:id/relationships',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('character_relationships')
        .select('*')
        .eq('project_id', request.params.id);

      if (error) {
        return { data: [] };
      }
      return { data: data ?? [] };
    }
  );

  // 16. PATCH /v1/anime/projects/:id
  app.patch(
    '/v1/anime/projects/:id',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(WRITE_ROLES)] },
    async (request: any) => {
      const projectId = request.params.id;
      const body = (request.body ?? {}) as Record<string, any>;

      const { data: existing, error: fetchErr } = await animeSupabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();

      if (fetchErr || !existing) {
        throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Project not found', cause: fetchErr });
      }

      const currentBible = (existing.story_bible && typeof existing.story_bible === 'object') ? existing.story_bible : {};
      const updatedBible = {
        ...currentBible,
        ...(body.visual_medium ? { visual_medium: body.visual_medium } : {}),
        ...(body.genre ? { genre: body.genre } : {}),
        ...(body.auto_approve !== undefined ? { auto_approve: Boolean(body.auto_approve) } : {}),
        ...(body.cover_image_url ? { cover_image_url: body.cover_image_url } : {}),
        ...(body.budget_ceiling !== undefined ? { budget_ceiling: Number(body.budget_ceiling) } : {}),
      };

      const patchPayload: Record<string, any> = {
        story_bible: updatedBible,
      };
      if (typeof body.name === 'string' && body.name.trim().length > 0) {
        patchPayload.name = body.name.trim();
      }
      if (typeof body.budget_ceiling === 'number' && 'budget_ceiling' in existing) {
        patchPayload.budget_ceiling = body.budget_ceiling;
      }

      const { data: updated, error: updateErr } = await animeSupabase
        .from('projects')
        .update(patchPayload)
        .eq('id', projectId)
        .select('*')
        .single();

      if (updateErr) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to update project settings', cause: updateErr });
      }
      return { data: updated };
    }
  );

  // 17. PATCH /v1/anime/projects/:id/budget
  app.patch(
    '/v1/anime/projects/:id/budget',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(WRITE_ROLES)] },
    async (request: any) => {
      const projectId = request.params.id;
      const body = (request.body ?? {}) as Record<string, any>;
      const ceiling = Number(body.budget_ceiling ?? body.limit ?? 1000);

      const { data: existing } = await animeSupabase
        .from('projects')
        .select('story_bible')
        .eq('id', projectId)
        .maybeSingle();

      const currentBible = (existing?.story_bible && typeof existing.story_bible === 'object') ? existing.story_bible : {};
      const { data, error } = await animeSupabase
        .from('projects')
        .update({ story_bible: { ...currentBible, budget_ceiling: ceiling } })
        .eq('id', projectId)
        .select('*')
        .single();

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to update budget limit', cause: error });
      }
      return { data: { project_id: projectId, budget_ceiling: ceiling, project: data } };
    }
  );

  // 18. GET /v1/anime/projects/:id/media
  app.get(
    '/v1/anime/projects/:id/media',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const projectId = request.params.id;
      const [scenesRes, clipsRes, charsRes] = await Promise.all([
        animeSupabase.from('scenes').select('*').eq('project_id', projectId).order('scene_order', { ascending: true }),
        animeSupabase.from('clips').select('*').eq('project_id', projectId),
        animeSupabase.from('characters').select('id, character_code, name, image_url, reference_version').eq('project_id', projectId),
      ]);

      return {
        data: {
          scenes: scenesRes.data ?? [],
          clips: clipsRes.data ?? [],
          character_refs: (charsRes.data ?? []).filter((c: any) => Boolean(c.image_url)),
        },
      };
    }
  );

  // 19. GET /v1/anime/projects/:id/canon/proposals
  app.get(
    '/v1/anime/projects/:id/canon/proposals',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('approval_decisions')
        .select('*')
        .eq('project_id', request.params.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch canon proposals', cause: error });
      }
      const filtered = (data ?? []).filter((d: any) =>
        String(d.type || '').toUpperCase().includes('CANON') ||
        String(d.status || '').toUpperCase() === 'PENDING'
      );
      return { data: filtered };
    }
  );

  // 20. GET /v1/anime/projects/:id/notifications
  app.get(
    '/v1/anime/projects/:id/notifications',
    { schema: { params: ProjParamsSchema }, preHandler: [requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('audit_log')
        .select('*')
        .eq('project_id', request.params.id)
        .order('created_at', { ascending: false })
        .limit(40);

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch notifications', cause: error });
      }
      return { data: data ?? [] };
    }
  );
}
