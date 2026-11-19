import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { extractUserId, requireProjectRole } from '../auth/project-guard';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { approveBiblePatch, listBiblePatches, rejectBiblePatch } from './bible.patch.service';

const ProjParamsSchema = Type.Object({ id: Type.String({ format: 'uuid' }) });
const PatchParamsSchema = Type.Object({ id: Type.String({ format: 'uuid' }), patchId: Type.String({ format: 'uuid' }) });
const ApproveSchema = Type.Object({
  base_hash: Type.Optional(Type.String()),
  expected_base_hash: Type.Optional(Type.String()),
}, { additionalProperties: true });
const RejectSchema = Type.Object({ reason: Type.Optional(Type.String({ maxLength: 1000 })) }, { additionalProperties: true });

function requireUserId(request: any): string {
  const userId = extractUserId(request);
  if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Auth missing' });
  return userId;
}

export async function registerAnimeBiblePatchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/projects/:id/bible/patches', {
    schema: { params: ProjParamsSchema },
    preHandler: [app.authenticate, requireProjectRole(['owner', 'admin', 'editor', 'reviewer', 'viewer'])],
  }, async (request: any) => ({ data: await listBiblePatches(request.params.id) }));

  app.get('/v1/anime/projects/:id/bible/drafts', {
    schema: { params: ProjParamsSchema },
    preHandler: [app.authenticate, requireProjectRole(['owner', 'admin', 'editor', 'reviewer', 'viewer'])],
  }, async (request: any) => ({ data: await listBiblePatches(request.params.id) }));

  app.post('/v1/anime/projects/:id/bible/drafts/:patchId/apply', {
    schema: { params: PatchParamsSchema, body: ApproveSchema },
    preHandler: [app.authenticate, requireProjectRole(['owner', 'admin', 'editor'])],
  }, async (request: any) => ({
    data: await approveBiblePatch({
      project_id: request.params.id,
      patch_id: request.params.patchId,
      user_id: requireUserId(request),
      expected_base_hash: request.body?.expected_base_hash || request.body?.base_hash,
      request_id: request.anime?.request_id,
    }),
  }));

  app.post('/v1/anime/projects/:id/bible/drafts/:patchId/reject', {
    schema: { params: PatchParamsSchema, body: RejectSchema },
    preHandler: [app.authenticate, requireProjectRole(['owner', 'admin', 'editor'])],
  }, async (request: any) => ({
    data: await rejectBiblePatch({
      project_id: request.params.id,
      patch_id: request.params.patchId,
      user_id: requireUserId(request),
      reason: request.body?.reason,
      request_id: request.anime?.request_id,
    }),
  }));

  app.post('/v1/anime/projects/:id/bible/patches/:patchId/approve', {
    schema: { params: PatchParamsSchema, body: ApproveSchema },
    preHandler: [app.authenticate, requireProjectRole(['owner', 'admin', 'editor'])],
  }, async (request: any) => ({
    data: await approveBiblePatch({
      project_id: request.params.id,
      patch_id: request.params.patchId,
      user_id: requireUserId(request),
      expected_base_hash: request.body?.expected_base_hash || request.body?.base_hash,
      request_id: request.anime?.request_id,
    }),
  }));

  app.post('/v1/anime/projects/:id/bible/patches/:patchId/reject', {
    schema: { params: PatchParamsSchema, body: RejectSchema },
    preHandler: [app.authenticate, requireProjectRole(['owner', 'admin', 'editor'])],
  }, async (request: any) => ({
    data: await rejectBiblePatch({
      project_id: request.params.id,
      patch_id: request.params.patchId,
      user_id: requireUserId(request),
      reason: request.body?.reason,
      request_id: request.anime?.request_id,
    }),
  }));
}
