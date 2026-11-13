import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

const READ_ROLES = ['owner', 'admin', 'editor', 'reviewer', 'viewer'];
const WRITE_ROLES = ['owner', 'admin', 'editor'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeGenerationSetting(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

const ProjParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
});

const CharRefParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  cid: Type.String({ minLength: 1 }),
});

const EpisodeParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  episodeNo: Type.Union([Type.String(), Type.Number()]),
});

const SceneParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  episodeNo: Type.Union([Type.String(), Type.Number()]),
  sceneId: Type.String({ minLength: 1 }),
});

const JobCancelParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  jobId: Type.String({ format: 'uuid' }),
});

async function requireAuthenticatedUserId(request: any): Promise<string> {
  if (!request.user && typeof request.jwtVerify === 'function') {
    try {
      await request.jwtVerify();
    } catch (_err) {
      // Fall through to check headers/context
    }
  }
  const uid =
    request.user?.sub ||
    request.authContext?.userId;

  if (!uid || typeof uid !== 'string' || !UUID_REGEX.test(uid)) {
    throw new AnimeError({
      code: AnimeErrorCode.AUTH_INVALID,
      message: 'Verified authenticated user identity is required',
    });
  }
  return uid;
}

async function syncCharacterStatusSafe(
  projectId: string,
  characterId: string,
  characterCode: string,
  statusVal: string
): Promise<void> {
  const { data: existingStatus } = await animeSupabase
    .from('character_status')
    .select('id')
    .eq('project_id', projectId)
    .eq('character_code', characterCode)
    .maybeSingle();

  if (existingStatus?.id) {
    await animeSupabase
      .from('character_status')
      .update({
        status: statusVal.toLowerCase(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingStatus.id);
  } else {
    await animeSupabase.from('character_status').insert({
      project_id: projectId,
      character_id: characterId,
      character_code: characterCode,
      status: statusVal.toLowerCase(),
    });
  }
}

export async function registerAnimeLoreRoutes(app: FastifyInstance): Promise<void> {
  // 1. GET /v1/anime/projects/:id/quota
  app.get(
    '/v1/anime/projects/:id/quota',
    { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const projectId = request.params.id;
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      const [quotaRes, projRes] = await Promise.all([
        animeSupabase
          .from('quota_usage')
          .select('*')
          .eq('project_id', projectId)
          .gte('usage_date', yesterday)
          .order('usage_date', { ascending: false }),
        animeSupabase.from('projects').select('story_bible').eq('id', projectId).maybeSingle(),
      ]);

      if (quotaRes.error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch quota usage', cause: quotaRes.error });
      }

      const rows = quotaRes.data ?? [];
      const bible = (projRes.data?.story_bible && typeof projRes.data.story_bible === 'object') ? projRes.data.story_bible : {};
      const configuredLimit = Number(bible.budget_ceiling ?? process.env.DAILY_QUOTA_LIMIT ?? 5000);

      const totalUnitsUsed = rows.reduce((acc: number, r: any) => acc + Number(r.accumulated_units ?? 0), 0);

      return {
        data: {
          project_id: projectId,
          since_date: yesterday,
          records_count: rows.length,
          requests_count: rows.length,
          accumulated_units: totalUnitsUsed,
          daily_limit: configuredLimit,
          latest: rows[0] ?? null,
          items: rows,
        },
      };
    }
  );

  // 2. GET /v1/anime/projects/:id/continuity
  app.get(
    '/v1/anime/projects/:id/continuity',
    { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('continuity_checks')
        .select('*')
        .eq('project_id', request.params.id)
        .order('checked_at', { ascending: false });

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch continuity checks', cause: error });
      }

      const normalized = (data ?? []).map((row: any) => {
        const errs = Array.isArray(row.errors) ? row.errors : [];
        const warns = Array.isArray(row.warnings) ? row.warnings : [];
        const derivedSeverity =
          row.severity ||
          (errs.length > 2 ? 'CRITICAL' : errs.length > 0 ? 'ERROR' : warns.length > 0 ? 'WARNING' : 'NONE');
        return {
          ...row,
          severity: derivedSeverity,
        };
      });

      return { data: normalized };
    }
  );

  // 3. GET /v1/anime/projects/:id/retries
  app.get(
    '/v1/anime/projects/:id/retries',
    { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { data, error } = await animeSupabase
        .from('pending_actions')
        .select('*')
        .eq('project_id', request.params.id)
        .in('status', ['failed', 'retry_scheduled', 'dead_letter', 'FAILED', 'RETRY_SCHEDULED', 'DEAD_LETTER'])
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
    { schema: { params: CharRefParamsSchema }, preHandler: [app.authenticate, requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const { id: projectId, cid } = request.params;
      if (cid === 'default' || !cid.trim()) {
        return { data: [] };
      }

      let query = animeSupabase
        .from('character_reference_history')
        .select('*')
        .eq('project_id', projectId);

      if (UUID_REGEX.test(cid)) {
        query = query.or(`character_id.eq.${cid},character_code.eq.${cid}`);
      } else {
        query = query.eq('character_code', cid);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to fetch character reference history', cause: error });
      }
      return { data: data ?? [] };
    }
  );

  // 5-15. Explicit Lore & Category Read Routes
  const categoryRoutes: Array<{ slug: string; table: string; activeCol?: string; activeVal?: any }> = [
    { slug: 'character-knowledge', table: 'character_knowledge' },
    { slug: 'mysteries', table: 'mystery_tracker' },
    { slug: 'arcs', table: 'character_arcs' },
    { slug: 'powers', table: 'power_system' },
    { slug: 'locations', table: 'locations' },
    { slug: 'artifacts', table: 'artifacts' },
    { slug: 'rules', table: 'story_rules', activeCol: 'active', activeVal: true },
    { slug: 'foreshadowing', table: 'foreshadowing' },
    { slug: 'character-status', table: 'character_status' },
    { slug: 'relationships', table: 'character_relationships' },
  ];

  for (const routeCfg of categoryRoutes) {
    app.get(
      `/v1/anime/projects/:id/${routeCfg.slug}`,
      { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(READ_ROLES)] },
      async (request: any) => {
        let q = animeSupabase.from(routeCfg.table).select('*').eq('project_id', request.params.id);
        if (routeCfg.activeCol !== undefined) {
          q = q.eq(routeCfg.activeCol, routeCfg.activeVal);
        }
        const { data, error } = await q;
        if (error) {
          throw new AnimeError({
            code: AnimeErrorCode.INTERNAL,
            message: `Failed to fetch ${routeCfg.slug} from ${routeCfg.table}`,
            cause: error,
          });
        }
        return { data: data ?? [] };
      }
    );
  }

  // GET /v1/anime/projects/:id/voices
  app.get(
    '/v1/anime/projects/:id/voices',
    { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(READ_ROLES)] },
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

  // 16. POST /v1/anime/projects
  app.post(
    '/v1/anime/projects',
    { preHandler: [app.authenticate] },
    async (request: any, reply: any) => {
      const userId = await requireAuthenticatedUserId(request);
      const body = (request.body ?? {}) as Record<string, any>;
      const name = String(body.name || body.title || '').trim();
      if (!name) {
        throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Project name is required' });
      }

      const visualMedium = String(body.visual_medium || 'ANIME').toUpperCase();
      const genre = String(body.genre || 'Action / Fantasy');
      const initialBible = {
        ...(body.story_bible && typeof body.story_bible === 'object' ? body.story_bible : {}),
        visual_medium: visualMedium,
        genre,
        premise: body.premise || body.description || '',
        auto_approve: Boolean(body.auto_approve ?? false),
        budget_ceiling: Number(body.budget_ceiling ?? 1000),
        ...(body.cover_image_url ? { cover_image_url: body.cover_image_url } : {}),
        target_episode_count: normalizeGenerationSetting(body.target_episode_count, 12, 1, 500),
        episode_duration_min: normalizeGenerationSetting(body.episode_duration_min, 24, 1, 120),
        script_word_count: normalizeGenerationSetting(body.script_word_count, 1500, 100, 20000),
      };

      const { data: created, error: createErr } = await animeSupabase
        .from('projects')
        .insert({
          name,
          user_id: userId,
          is_active: true,
          genre,
          visual_medium: visualMedium,
          description: body.description || body.premise || null,
          story_bible: initialBible,
        })
        .select('*')
        .single();

      if (createErr || !created) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to create project', cause: createErr });
      }

      const promptIds = Array.isArray(body.prompt_ids)
        ? body.prompt_ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        : [];
      if (promptIds.length > 0 && created.id) {
        const { data: promptRows } = await animeSupabase
          .from('user_system_prompts')
          .select('id, prompt_category, visual_medium')
          .eq('user_id', userId)
          .in('id', promptIds);
        const ownedPrompts = Array.isArray(promptRows) ? promptRows : [];
        if (ownedPrompts.length > 0) {
          await animeSupabase
            .from('project_prompt_associations')
            .upsert(
              ownedPrompts.map((prompt: any) => ({
                project_id: created.id,
                prompt_id: prompt.id,
                user_id: userId,
                surface: String(prompt.prompt_category || 'LIBRARY'),
              })),
              { onConflict: 'project_id,prompt_id' }
            );
          const biblePrompt = ownedPrompts.find(
            (prompt: any) => String(prompt.prompt_category || 'BIBLE').toUpperCase() === 'BIBLE'
          );
          if (biblePrompt) {
            await animeSupabase
              .from('projects')
              .update({ active_system_prompt_id: biblePrompt.id })
              .eq('id', created.id)
              .eq('user_id', userId);
          }
        }
      }

      return reply.status(201).send({ data: created });
    }
  );

  // 17. PATCH /v1/anime/projects/:id
  app.patch(
    '/v1/anime/projects/:id',
    { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(WRITE_ROLES)] },
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
      const incomingBible = (body.story_bible && typeof body.story_bible === 'object') ? body.story_bible : {};

      const updatedBible = {
        ...currentBible,
        ...incomingBible,
        ...(body.visual_medium !== undefined ? { visual_medium: body.visual_medium } : {}),
        ...(body.genre !== undefined ? { genre: body.genre } : {}),
        ...(body.auto_approve !== undefined ? { auto_approve: Boolean(body.auto_approve) } : {}),
        ...(body.cover_image_url !== undefined ? { cover_image_url: body.cover_image_url } : {}),
        ...(body.budget_ceiling !== undefined ? { budget_ceiling: Number(body.budget_ceiling) } : {}),
        ...(body.target_episode_count !== undefined
          ? { target_episode_count: normalizeGenerationSetting(body.target_episode_count, 12, 1, 500) }
          : {}),
        ...(body.episode_duration_min !== undefined
          ? { episode_duration_min: normalizeGenerationSetting(body.episode_duration_min, 24, 1, 120) }
          : {}),
        ...(body.script_word_count !== undefined
          ? { script_word_count: normalizeGenerationSetting(body.script_word_count, 1500, 100, 20000) }
          : {}),
      };

      const patchPayload: Record<string, any> = {
        story_bible: updatedBible,
      };
      if (typeof body.name === 'string' && body.name.trim().length > 0) {
        patchPayload.name = body.name.trim();
      }
      if (body.visual_medium !== undefined) {
        patchPayload.visual_medium = String(body.visual_medium).toUpperCase();
      }
      if (body.genre !== undefined) {
        patchPayload.genre = String(body.genre);
      }
      if (body.description !== undefined) {
        patchPayload.description = body.description === null ? null : String(body.description);
      }
      if (body.active_system_prompt_id !== undefined) {
        patchPayload.active_system_prompt_id = body.active_system_prompt_id;
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

      return {
        data: {
          ...updated,
          visual_medium: updatedBible.visual_medium ?? 'ANIME',
          genre: updatedBible.genre ?? 'Action / Fantasy',
          auto_approve: Boolean(updatedBible.auto_approve ?? false),
          cover_image_url: updatedBible.cover_image_url ?? null,
          budget_ceiling: Number(updatedBible.budget_ceiling ?? 1000),
        },
      };
    }
  );

  // 17b. DELETE /v1/anime/projects/:id
  // Hard delete; all project-scoped child rows use ON DELETE CASCADE (verified against the anime schema).
  app.delete(
    '/v1/anime/projects/:id',
    { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(WRITE_ROLES)] },
    async (request: any, reply: any) => {
      const projectId = request.params.id;
      const userId = await requireAuthenticatedUserId(request);

      const { data: existing, error: fetchErr } = await animeSupabase
        .from('projects')
        .select('id, user_id, name')
        .eq('id', projectId)
        .maybeSingle();

      if (fetchErr || !existing) {
        throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Project not found', cause: fetchErr });
      }
      if (existing.user_id && userId && String(existing.user_id) !== String(userId)) {
        throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Only the project owner can delete this project' });
      }

      const { error: deleteErr } = await animeSupabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (deleteErr) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to delete project', cause: deleteErr });
      }

      return reply.status(200).send({ data: { id: projectId, deleted: true } });
    }
  );

  // 18. PATCH /v1/anime/projects/:id/bible
  app.patch(
    '/v1/anime/projects/:id/bible',
    { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(WRITE_ROLES)] },
    async (request: any) => {
      const projectId = request.params.id;
      const body = (request.body ?? {}) as Record<string, any>;

      const { data: existing, error: fetchErr } = await animeSupabase
        .from('projects')
        .select('story_bible')
        .eq('id', projectId)
        .maybeSingle();

      if (fetchErr || !existing) {
        throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Project not found', cause: fetchErr });
      }

      const currentBible = (existing.story_bible && typeof existing.story_bible === 'object') ? existing.story_bible : {};
      const mergedBible = {
        ...currentBible,
        ...(body.story_bible && typeof body.story_bible === 'object' ? body.story_bible : body),
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateErr } = await animeSupabase
        .from('projects')
        .update({ story_bible: mergedBible })
        .eq('id', projectId)
        .select('id, name, story_bible')
        .single();

      if (updateErr) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to save Story Bible', cause: updateErr });
      }

      return { data: updated.story_bible };
    }
  );

  // 19. PATCH /v1/anime/projects/:id/budget
  app.patch(
    '/v1/anime/projects/:id/budget',
    { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(WRITE_ROLES)] },
    async (request: any) => {
      const projectId = request.params.id;
      const body = (request.body ?? {}) as Record<string, any>;
      const ceiling = Number(body.budget_ceiling ?? body.limit ?? 1000);
      if (!Number.isFinite(ceiling) || ceiling <= 0) {
        throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Budget ceiling must be a positive number' });
      }

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

  // 20. POST & PATCH Characters
  app.post(
    '/v1/anime/projects/:id/characters',
    { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(WRITE_ROLES)] },
    async (request: any) => {
      const projectId = request.params.id;
      const body = (request.body ?? {}) as Record<string, any>;
      const name = String(body.name || '').trim();
      if (!name) {
        throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Character name is required' });
      }

      const charCode = String(body.character_code || `CHAR_${Date.now().toString().slice(-5)}`).toUpperCase();
      const roleVal = String(body.role || 'SUPPORTING');
      const visualDna = (body.visual_dna && typeof body.visual_dna === 'object')
        ? { ...body.visual_dna, role: roleVal }
        : { summary: String(body.visual_dna || ''), role: roleVal };
      const voiceConfig = (body.voice_config && typeof body.voice_config === 'object')
        ? body.voice_config
        : (body.voice_id ? { voice_id: String(body.voice_id) } : {});

      const insertPayload: Record<string, any> = {
        project_id: projectId,
        character_code: charCode,
        name,
        description: body.description || '',
        visual_dna: visualDna,
        voice_config: voiceConfig,
        initial_status: body.status || body.initial_status || 'alive',
        image_url: body.image_url || null,
      };

      const { data: created, error } = await animeSupabase
        .from('characters')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to create character', cause: error });
      }

      await syncCharacterStatusSafe(projectId, created.id, charCode, String(body.status || 'alive'));

      return { data: { ...created, role: roleVal } };
    }
  );

  app.patch(
    '/v1/anime/projects/:id/characters/:cid',
    { schema: { params: CharRefParamsSchema }, preHandler: [app.authenticate, requireProjectRole(WRITE_ROLES)] },
    async (request: any) => {
      const { id: projectId, cid } = request.params;
      const body = (request.body ?? {}) as Record<string, any>;

      let findQuery = animeSupabase.from('characters').select('*').eq('project_id', projectId);
      if (UUID_REGEX.test(cid)) {
        findQuery = findQuery.or(`id.eq.${cid},character_code.eq.${cid}`);
      } else {
        findQuery = findQuery.eq('character_code', cid);
      }

      const { data: existing, error: findErr } = await findQuery.maybeSingle();
      if (findErr || !existing) {
        throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Character not found', cause: findErr });
      }

      const currentDna = (existing.visual_dna && typeof existing.visual_dna === 'object') ? existing.visual_dna : {};
      const currentVoice = (existing.voice_config && typeof existing.voice_config === 'object') ? existing.voice_config : {};

      const patchFields: Record<string, any> = {};
      if (typeof body.name === 'string' && body.name.trim()) patchFields.name = body.name.trim();
      if (typeof body.description === 'string') patchFields.description = body.description;
      if (body.image_url !== undefined) patchFields.image_url = body.image_url;
      if (body.status !== undefined) patchFields.initial_status = String(body.status).toLowerCase();

      if (body.role !== undefined || body.visual_dna !== undefined) {
        patchFields.visual_dna = {
          ...currentDna,
          ...(typeof body.visual_dna === 'object' && body.visual_dna ? body.visual_dna : {}),
          ...(typeof body.visual_dna === 'string' ? { summary: body.visual_dna } : {}),
          ...(body.role !== undefined ? { role: body.role } : {}),
        };
      }

      if (body.voice_id !== undefined || body.voice_config !== undefined) {
        patchFields.voice_config = {
          ...currentVoice,
          ...(typeof body.voice_config === 'object' && body.voice_config ? body.voice_config : {}),
          ...(body.voice_id !== undefined ? { voice_id: body.voice_id } : {}),
        };
      }

      const { data: updated, error: updErr } = await animeSupabase
        .from('characters')
        .update(patchFields)
        .eq('id', existing.id)
        .select('*')
        .single();

      if (updErr) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to update character', cause: updErr });
      }

      if (body.status !== undefined) {
        await syncCharacterStatusSafe(projectId, existing.id, existing.character_code, String(body.status));
      }

      return { data: updated };
    }
  );

  // 21. PATCH /v1/anime/projects/:id/episodes/:episodeNo
  app.patch(
    '/v1/anime/projects/:id/episodes/:episodeNo',
    { schema: { params: EpisodeParamsSchema }, preHandler: [app.authenticate, requireProjectRole(WRITE_ROLES)] },
    async (request: any) => {
      const projectId = request.params.id;
      const episodeNo = Number(request.params.episodeNo);
      const body = (request.body ?? {}) as Record<string, any>;

      const { data: existingEp } = await animeSupabase
        .from('episodes')
        .select('script_json')
        .eq('project_id', projectId)
        .eq('episode_no', episodeNo)
        .maybeSingle();

      const currentScriptJson =
        existingEp?.script_json && typeof existingEp.script_json === 'object'
          ? existingEp.script_json
          : {};

      const patchData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (typeof body.title === 'string') patchData.title = body.title.trim();
      if (typeof body.synopsis === 'string') patchData.synopsis = body.synopsis;
      if (typeof body.status === 'string') patchData.current_state = body.status;
      if (typeof body.current_state === 'string') patchData.current_state = body.current_state;
      if (typeof body.qc_status === 'string') patchData.qc_status = body.qc_status;

      if (body.script_json !== undefined || typeof body.script_text === 'string' || body.prompt_id !== undefined) {
        patchData.script_json = {
          ...currentScriptJson,
          ...(typeof body.script_json === 'object' && body.script_json ? body.script_json : {}),
          ...(typeof body.script_text === 'string' ? { raw_script: body.script_text } : {}),
          ...(body.prompt_id !== undefined ? { prompt_id: body.prompt_id } : {}),
          updated_at: new Date().toISOString(),
        };
      }

      const { data, error } = await animeSupabase
        .from('episodes')
        .update(patchData)
        .eq('project_id', projectId)
        .eq('episode_no', episodeNo)
        .select('*')
        .single();

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to update episode', cause: error });
      }
      return { data };
    }
  );

  // 22. PATCH /v1/anime/projects/:id/episodes/:episodeNo/scenes/:sceneId
  app.patch(
    '/v1/anime/projects/:id/episodes/:episodeNo/scenes/:sceneId',
    { schema: { params: SceneParamsSchema }, preHandler: [app.authenticate, requireProjectRole(WRITE_ROLES)] },
    async (request: any) => {
      const { id: projectId, sceneId } = request.params;
      const body = (request.body ?? {}) as Record<string, any>;

      const patchData: Record<string, any> = {};
      if (typeof body.description === 'string') patchData.description = body.description;
      if (typeof body.visual_prompt === 'string') patchData.visual_prompt = body.visual_prompt;
      if (typeof body.status === 'string') patchData.status = body.status;

      let query = animeSupabase.from('scenes').update(patchData).eq('project_id', projectId);
      if (UUID_REGEX.test(sceneId)) {
        query = query.eq('id', sceneId);
      } else {
        query = query.eq('scene_order', Number(sceneId) || 1);
      }

      const { data, error } = await query.select('*').single();
      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to update scene', cause: error });
      }
      return { data };
    }
  );

  // 23. POST /v1/anime/projects/:id/jobs/:jobId/cancel
  app.post(
    '/v1/anime/projects/:id/jobs/:jobId/cancel',
    { schema: { params: JobCancelParamsSchema }, preHandler: [app.authenticate, requireProjectRole(WRITE_ROLES)] },
    async (request: any) => {
      const { id: projectId, jobId } = request.params;
      const nowIso = new Date().toISOString();

      const { data: cancelledCmd, error: cmdErr } = await animeSupabase
        .from('api_commands')
        .update({ status: 'CANCELLED' })
        .eq('project_id', projectId)
        .eq('id', jobId)
        .select('*')
        .maybeSingle();

      if (cmdErr) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to cancel job', cause: cmdErr });
      }

      await animeSupabase
        .from('pending_actions')
        .update({ status: 'CANCELLED' })
        .eq('project_id', projectId)
        .eq('job_id', jobId);

      return {
        data: {
          job_id: jobId,
          project_id: projectId,
          status: 'CANCELLED',
          cancelled_at: nowIso,
          command: cancelledCmd,
        },
      };
    }
  );

  // 24. GET /v1/anime/projects/:id/media
  app.get(
    '/v1/anime/projects/:id/media',
    { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(READ_ROLES)] },
    async (request: any) => {
      const projectId = request.params.id;
      const [scenesRes, clipsRes, charsRes] = await Promise.all([
        animeSupabase.from('scenes').select('*').eq('project_id', projectId).order('scene_order', { ascending: true }),
        animeSupabase.from('clips').select('*').eq('project_id', projectId),
        animeSupabase.from('characters').select('id, character_code, name, image_url, reference_version').eq('project_id', projectId),
      ]);

      if (scenesRes.error || clipsRes.error || charsRes.error) {
        throw new AnimeError({
          code: AnimeErrorCode.INTERNAL,
          message: 'Failed to load project media assets',
          cause: scenesRes.error || clipsRes.error || charsRes.error,
        });
      }

      return {
        data: {
          scenes: scenesRes.data ?? [],
          clips: clipsRes.data ?? [],
          character_refs: (charsRes.data ?? []).filter((c: any) => Boolean(c.image_url)),
        },
      };
    }
  );

  // 25. POST /v1/anime/projects/:id/canon (A6 & A11 FIXED: Includes fact_type NOT NULL column)
  app.post(
    '/v1/anime/projects/:id/canon',
    { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(WRITE_ROLES)] },
    async (request: any) => {
      const projectId = request.params.id;
      const body = (request.body ?? {}) as Record<string, any>;
      const rawFact = String(body.fact_value || body.fact || body.description || '').trim();
      if (!rawFact) {
        throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Canon fact text is required' });
      }
      const factKey = String(body.fact_key || `CANON_${Date.now().toString().slice(-6)}`).trim();
      const canonStatus = body.locked === false ? 'DRAFT' : String(body.canon_status || 'LOCKED').toUpperCase();

      const { data, error } = await animeSupabase
        .from('canon_facts')
        .insert({
          project_id: projectId,
          fact_type: String(body.fact_type || 'WORLD_RULE'),
          fact_key: factKey,
          fact_value: { statement: rawFact, category: body.category || 'WORLD_LAW' },
          canon_status: canonStatus,
        })
        .select('*')
        .single();

      if (error) {
        throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to insert canon fact', cause: error });
      }
      return { data };
    }
  );

  // 26. GET /v1/anime/projects/:id/canon/proposals
  app.get(
    '/v1/anime/projects/:id/canon/proposals',
    { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(READ_ROLES)] },
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
        String(d.type || '').toUpperCase().includes('CANON') || String(d.status || '').toUpperCase() === 'PENDING'
      );
      return { data: filtered };
    }
  );

  // 27. GET /v1/anime/projects/:id/notifications
  app.get(
    '/v1/anime/projects/:id/notifications',
    { schema: { params: ProjParamsSchema }, preHandler: [app.authenticate, requireProjectRole(READ_ROLES)] },
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
