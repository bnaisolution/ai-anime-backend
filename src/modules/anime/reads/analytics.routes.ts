import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { getAnalytics, getAudit } from './analytics.service';
const P = Type.Object({ id: Type.String({ format: 'uuid' }) });
export async function registerAnimeAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/projects/:id/analytics', { schema: { params: P }, preHandler: [requireProjectRole(['owner', 'admin', 'editor', 'reviewer', 'viewer'])] }, async (req: any) => ({ data: await getAnalytics(req.params.id) }));
  app.get('/v1/anime/projects/:id/audit', { schema: { params: P }, preHandler: [requireProjectRole(['owner', 'admin', 'reviewer'])] }, async (req: any) => ({ data: await getAudit(req.params.id) }));
}
