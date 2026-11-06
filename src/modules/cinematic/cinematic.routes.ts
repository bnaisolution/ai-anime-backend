import { FastifyInstance } from 'fastify';
import { animeSupabase } from '../anime/db/anime.supabase';
import { submitAnimeCommand } from '../anime/commands/commands.service';
import { CommandIntent } from '../anime/commands/commands.types';
import crypto from 'crypto';

export default async function cinematicRoutes(fastify: FastifyInstance) {
  // 1. GET /api/v1/cinematic/studio
  fastify.get('/studio', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const { data: projects } = await animeSupabase.from('projects').select('id, name, current_season, current_episode').eq('user_id', auth.userId).limit(5);
    const { data: episodes } = await animeSupabase.from('episodes').select('id, project_id, episode_no, title, current_state').limit(10);

    return {
      status: 'completed',
      project_namespace: 'Cinematic',
      architecture_rule: 'Thin adapter over Anime Engine',
      projects: projects || [],
      recent_episodes: episodes || []
    };
  });

  // 2. POST /api/v1/cinematic/stage-action
  fastify.post('/stage-action', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const auth = request.authContext;
    const body: any = request.body || {};
    if (!body.stage_id) return reply.code(400).send({ status: 'failed', errors: [{ message: 'stage_id required' }] });

    try {
      const submission = await submitAnimeCommand({
        idempotencyKey: `cinematic_stg_${crypto.randomUUID()}`,
        userId: auth.userId,
        requestId: crypto.randomUUID(),
        body: {
          intent: CommandIntent.GENERATE_EPISODE,
          project_id: body.project_id || '11111111-1111-1111-1111-111111111111',
          mode: 'SAVE',
          payload: { stage_id: body.stage_id, operation: body.operation || 'queue' }
        }
      });

      return reply.send({ status: 'completed', message: 'Stage action queued to anime engine', command: submission.command });
    } catch (e: any) {
      return reply.code(400).send({ status: 'failed', errors: [{ message: e.message }] });
    }
  });

  // 3. POST /api/v1/cinematic/copilot-context
  fastify.post('/copilot-context', { preHandler: [fastify.authenticate] }, async (request) => {
    const body: any = request.body || {};
    return {
      status: 'completed',
      isolated_project_id: 'cinematic',
      project_namespace: 'Cinematic',
      recommended_session_mode: 'Story',
      copilot_handoff_context: {
        current_episode: body.current_episode || 'EP-01',
        current_scene: body.current_scene || 'SCN-01',
        failed_production_stage: body.failed_production_stage || 'Scenes',
        relevant_error: body.relevant_error || 'None reported'
      }
    };
  });
}
