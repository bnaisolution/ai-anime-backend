import type { FastifyInstance } from 'fastify';
import { animeSupabase } from '../db/anime.supabase';
export async function registerAnimeHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/health', async (_req, reply) => {
    const { error } = await animeSupabase.from('projects').select('id').limit(1);
    void reply.status(error ? 503 : 200); return { ok: !error, db: error ? 'down' : 'up', version: '6.5.0' };
  });
}
