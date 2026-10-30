import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { checkBudgetCeiling } from '../ledger/ledger.service';
export async function registerAnimeAdminLedgerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/admin/anime/ledger/summary', { schema: { querystring: Type.Object({ project_id: Type.String({ format: 'uuid' }) }) }, preValidation: [async (req: any) => { req.params = { ...req.params, project_id: req.query.project_id }; }], preHandler: [requireProjectRole(['owner', 'admin'])] }, async (req: any) => { return { data: await checkBudgetCeiling(req.query.project_id, 0) }; });
}
