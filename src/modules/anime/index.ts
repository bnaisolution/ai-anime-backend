import { extractUserId } from './auth/project-guard';
import { createProjectSynchronous } from './reads/projects.service';
import { animeSupabase } from './db/anime.supabase';
import type { FastifyInstance } from 'fastify';
import { registerAnimeAdminLedgerRoutes } from './admin/ledger.routes';
import { registerAnimeAdminSystemRoutes } from './admin/system.routes';
import { registerAnimeAdminWorkersRoutes } from './admin/workers.routes';
import { registerAnimeApprovalsRoutes } from './approvals/approvals.routes';
import { registerAnimeCallbacksRoutes } from './callbacks/callbacks.routes';
import { registerAnimeCommandsRoutes } from './commands/commands.routes';
import { animeErrorHandler } from './errors/anime.errors';
import { startBrainWorker } from './intelligence/brain.worker';
import { startIncidentWorker } from './intelligence/incident.worker';
import { registerAnimeMediaRoutes } from './media/media.routes';
import { animeRequestIdHook } from './middleware/request-id';
import { outboxDispatcher } from './outbox/outbox.dispatcher';
import { registerAnimeAnalyticsRoutes } from './reads/analytics.routes';
import { registerAnimeCreativeRoutes } from './reads/creative.routes';
import { registerAnimeReadsRoutes } from './reads/reads.routes';
import { registerAnimeHealthRoutes } from './routes/health.routes';
import { supervisorWorker } from './supervisor/supervisor.worker';
import { registerAnimeDevicesRoutes } from './system/devices.routes';

export async function registerAnimeModule(app: FastifyInstance): Promise<void> {
  // === BATCH6_GLOBAL_PREVALIDATION_HOOK (SIDE-EFFECT-FREE STUDIO CONTEXT & DUPLICATE GUARD) ===
  app.addHook('preValidation', async (request: any) => {
    const url = String(request.url || '');
    const body = request.body as Record<string, any> | undefined;
    if (!body || typeof body !== 'object') return;

    // 1. Compact SQL-RAG Context for AI Director (/api/v1/ai/chat)
    if (url.includes('/api/v1/ai/chat') && typeof body.message === 'string') {
      const screenCtx = body.current_screen ? `[Screen: ${body.current_screen}] ` : '';
      if (!body.message.includes('[ANIME_STUDIO_DIRECTOR]')) {
        body.system_instruction =
          'You are the AI Anime Director for StoryWF-00..13. Discuss anime production, Story Bible, Character Visual DNA, Continuity, Canon, and Pipeline actions. Never execute mutations without explicit user confirmation.';
        body.message = `${screenCtx}${body.message}`;
      }
    }

    // 2. Read-Only Context Enrichment & Duplicate Episode Generation Guard (Zero DB Mutations Here!)
    if (
      url.includes('/v1/anime/commands') ||
      url.includes('/vision/analyze') ||
      url.includes('/quick/image') ||
      url.includes('/quick/video')
    ) {
      const projectId = body.project_id || request.params?.id || request.headers?.['x-project-id'];
      if (!projectId || projectId === '00000000-0000-0000-0000-000000000000') return;

      const intentStr = String(body.intent || '').toUpperCase();

      // BUG-013: Prevent duplicate concurrent episode generation for the same project + episode
      if (intentStr === 'GENERATE_EPISODE' || intentStr === 'CONTINUE_EPISODE') {
        const epNo = Number(body.episode_no ?? body.payload?.episode_no ?? 1);
        const forceRegenerate = Boolean(body.payload?.force_regenerate ?? false);
        if (!forceRegenerate) {
          const { data: activeJobs } = await animeSupabase
            .from('api_commands')
            .select('id, status, intent')
            .eq('project_id', projectId)
            .in('intent', ['GENERATE_EPISODE', 'CONTINUE_EPISODE'])
            .in('status', ['QUEUED', 'DISPATCHED', 'ACKNOWLEDGED', 'RUNNING', 'RECONCILING'])
            .limit(5);

          if (activeJobs && activeJobs.length > 0) {
            request.activeDuplicateCommand = activeJobs[0];
          }
        }
      }

      try {
        const [{ data: proj }, { data: prompts }] = await Promise.all([
          animeSupabase.from('projects').select('story_bible').eq('id', projectId).maybeSingle(),
          animeSupabase
            .from('user_system_prompts')
            .select('*')
            .or(`project_id.eq.${projectId},project_id.is.null`)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        const bible = (proj?.story_bible && typeof proj.story_bible === 'object') ? proj.story_bible : {};
        const budgetCeiling = Number(bible.budget_ceiling ?? 1000);
        const autoApprove = Boolean(bible.auto_approve ?? false);
        const visualMedium = String(bible.visual_medium ?? 'ANIME');
        const visionProvider = String(bible.vision_provider ?? 'gemini');

        const categoryNeeded =
          intentStr.includes('BIBLE') ? 'BIBLE' :
          intentStr.includes('EPISODE') ? 'EPISODE' :
          intentStr.includes('IMAGE') || intentStr.includes('VISION') ? 'IMAGE' : 'BIBLE';

        const matchedPrompt = (prompts ?? []).find(
          (p: any) => String(p.prompt_category || 'BIBLE').toUpperCase() === categoryNeeded
        );

        const existingPayload = (body.payload && typeof body.payload === 'object') ? body.payload : {};
        body.payload = {
          ...existingPayload,
          budget_ceiling: existingPayload.budget_ceiling ?? budgetCeiling,
          auto_approve: existingPayload.auto_approve !== undefined ? existingPayload.auto_approve : autoApprove,
          visual_medium: existingPayload.visual_medium ?? visualMedium,
          vision_provider: existingPayload.vision_provider ?? visionProvider,
          ...(matchedPrompt?.prompt_text && !existingPayload.custom_system_prompt
            ? { custom_system_prompt: matchedPrompt.prompt_text, prompt_category: categoryNeeded }
            : {}),
        };
      } catch (_err) {
        // Read-only enrichment guard
      }
    }
  });
  // === END_BATCH6_GLOBAL_PREVALIDATION_HOOK ===


  


  app.addHook('onRequest', animeRequestIdHook);
  app.setErrorHandler(animeErrorHandler);
  await app.register(registerAnimeHealthRoutes);
  await app.register(registerAnimeDevicesRoutes);
  await app.register(registerAnimeCommandsRoutes);
  await app.register(registerAnimeCallbacksRoutes);
  await app.register(registerAnimeReadsRoutes);
  await app.register(registerAnimeCreativeRoutes);
  await app.register(registerAnimeMediaRoutes);
  await app.register(registerAnimeAnalyticsRoutes);
  await app.register(registerAnimeApprovalsRoutes);
  await app.register(registerAnimeAdminWorkersRoutes);
  await app.register(registerAnimeAdminLedgerRoutes);
  await app.register(registerAnimeAdminSystemRoutes);
  try {
    const infraRoutesMod: any = await import('./infrastructure/infrastructure.routes');
    const regFn = infraRoutesMod.registerAnimeInfrastructureRoutes || infraRoutesMod.registerInfrastructureRoutes || infraRoutesMod.default;
    if (typeof regFn === 'function') await app.register(regFn);
  } catch (_e) {}
  outboxDispatcher.start(2000);
  supervisorWorker.start(3000, 60000);
  startBrainWorker();
  startIncidentWorker();
}
