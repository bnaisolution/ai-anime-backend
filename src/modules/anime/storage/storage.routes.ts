import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { writeAudit } from '../audit/audit.writer';
import { listStorageProviders, putForUser, resolveStorageForUser } from './storage.service';

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const UploadBody = Type.Object({
  key: Type.String({ minLength: 1, maxLength: 512 }),
  filename: Type.String({ minLength: 1, maxLength: 255 }),
  content_type: Type.String({ minLength: 1, maxLength: 128 }),
  data_base64: Type.String({ minLength: 1, maxLength: 20_000_000 }),
  tenant_id: Type.Optional(Type.String({ format: 'uuid' })),
});

function userId(request: any): string {
  const value = request.authContext?.userId;
  if (typeof value !== 'string' || !value.trim()) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Authentication required.' });
  }
  return value;
}

export async function registerAnimeStorageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/storage/providers', { preHandler: [app.authenticate] }, async (request: any) => {
    return { data: listStorageProviders(), meta: { request_id: request.anime?.request_id } };
  });

  app.get('/v1/anime/storage/status', { preHandler: [app.authenticate] }, async (request: any) => {
    const tenantId = typeof request.query?.tenant_id === 'string' ? request.query.tenant_id : undefined;
    const resolved = await resolveStorageForUser(userId(request), tenantId);
    return {
      data: { configured: true, provider: resolved.provider, record_id: resolved.record_id, tenant_id: resolved.tenant_id },
      meta: { request_id: request.anime?.request_id },
    };
  });

  app.post('/v1/anime/storage/upload', { bodyLimit: 20 * 1024 * 1024, schema: { body: UploadBody }, preHandler: [app.authenticate] }, async (request: any) => {
    const data = Buffer.from(request.body.data_base64, 'base64');
    if (data.length === 0 || data.length > MAX_UPLOAD_BYTES) {
      throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Upload must be between 1 byte and 12 MiB.' });
    }
    const filename = String(request.body.filename).replace(/[^A-Za-z0-9._-]/g, '_');
    const result = await putForUser(userId(request), {
      key: request.body.key,
      filename,
      content_type: request.body.content_type,
      data,
    }, request.body.tenant_id);
    await writeAudit({
      project_id: null,
      user_id: userId(request),
      workflow_name: 'STORAGE',
      action: 'UPLOAD_STORAGE_OBJECT',
      entity_type: 'STORAGE_OBJECT',
      entity_id: result.key,
      new_value: { provider: result.provider, bytes: result.bytes, sha256: result.sha256, tenant_id: request.body.tenant_id ?? null },
      request_id: request.anime?.request_id,
    });
    return { data: result, meta: { request_id: request.anime?.request_id } };
  });
}
