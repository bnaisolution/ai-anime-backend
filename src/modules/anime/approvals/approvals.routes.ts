import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { decideApproval, listApprovals } from './approvals.service';
import { ApprovalStatus } from './approvals.types';
const ParamsSchema = Type.Object({ id: Type.String({ format: 'uuid' }), approvalId: Type.String({ format: 'uuid' }) });
const QuerySchema = Type.Object({ status: Type.Optional(Type.Enum(ApprovalStatus)), cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Integer({ default: 25 })) });
const BodySchema = Type.Object({ decision: Type.Union([Type.Literal(ApprovalStatus.APPROVED), Type.Literal(ApprovalStatus.REJECTED)]), resource_version: Type.Integer({ minimum: 1 }), reason: Type.String({ minLength: 1 }) });
const CreateApprovalSchema = Type.Object({ resource_id: Type.String(), requested_by: Type.String(), reason: Type.Optional(Type.String()), proposed_changes: Type.Optional(Type.JSON()) });
export async function registerAnimeApprovalsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/projects/:id/approvals', { schema: { params: Type.Object({ id: Type.String({ format: 'uuid' }) }), querystring: QuerySchema }, preHandler: [app.authenticate, requireProjectRole(['owner', 'admin', 'reviewer'])] }, async (request: any) => { return { data: (await listApprovals(request.params.id, request.query)).items }; });
  app.post('/v1/anime/projects/:id/approvals/:approvalId/decisions', { schema: { params: ParamsSchema, body: BodySchema }, preHandler: [app.authenticate, requireProjectRole(['owner', 'admin', 'reviewer'])] }, async (request: any) => { const actorUserId = request.anime?.user_id || request.authContext?.userId; return { data: await decideApproval({ project_id: request.params.id, approval_id: request.params.approvalId, decision: request.body.decision, expected_resource_version: request.body.resource_version, reason: request.body.reason, actor_user_id: actorUserId, request_id: request.anime?.request_id }) }; });
  app.post('/v1/anime/projects/:id/approvals', { schema: { params: Type.Object({ id: Type.String({ format: 'uuid' }) }), body: CreateApprovalSchema }, preHandler: [app.authenticate, requireProjectRole(['owner', 'admin', 'reviewer'])] }, async (request: any) => { const actorUserId = request.anime?.user_id || request.authContext?.userId; return { data: await createCanonApproval({ project_id: request.params.id, resource_id: request.body.resource_id, requested_by: actorUserId, reason: request.body.reason, proposed_changes: request.body.proposed_changes }) }; });
}
