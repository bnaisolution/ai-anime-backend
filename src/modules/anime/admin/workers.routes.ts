import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { listEligible, upsertHeartbeat } from '../registry/workers.repo';
export async function registerAnimeAdminWorkersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/admin/anime/workers', { schema: { querystring: Type.Object({ project_id: Type.String({ format: 'uuid' }) }) }, preValidation: [async (req: any) => { req.params = { ...req.params, project_id: req.query.project_id }; }], preHandler: [requireProjectRole(['owner', 'admin'])] }, async (req: any) => { return { data: await listEligible(req.query) }; });
  app.post('/v1/admin/anime/workers/heartbeat', { schema: { body: Type.Object({ project_id: Type.String({ format: 'uuid' }), worker_id: Type.String(), provider: Type.String(), status: Type.Optional(Type.String()), capacity: Type.Optional(Type.Any()) }) }, preHandler: [requireProjectRole(['owner', 'admin'])] }, async (req: any) => { return { data: await upsertHeartbeat(req.body) }; });
}
