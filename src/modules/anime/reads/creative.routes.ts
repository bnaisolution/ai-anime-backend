import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { getBible, getCanon, getCharacters, getTimeline } from './creative.service';
const P = Type.Object({ id: Type.String({ format: 'uuid' }) });
const R = ['owner', 'admin', 'editor', 'reviewer', 'viewer'];
export async function registerAnimeCreativeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/projects/:id/bible', { schema: { params: P }, preHandler: [requireProjectRole(R)] }, async (req: any) => ({ data: await getBible(req.params.id) }));
  app.get('/v1/anime/projects/:id/canon', { schema: { params: P }, preHandler: [requireProjectRole(R)] }, async (req: any) => ({ data: await getCanon(req.params.id) }));
  app.get('/v1/anime/projects/:id/characters', { schema: { params: P }, preHandler: [requireProjectRole(R)] }, async (req: any) => ({ data: await getCharacters(req.params.id) }));
  app.get('/v1/anime/projects/:id/timeline', { schema: { params: P }, preHandler: [requireProjectRole(R)] }, async (req: any) => ({ data: await getTimeline(req.params.id) }));
}
