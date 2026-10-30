import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { handleCallbackRequest } from './callbacks.handler';
function readHeader(request: FastifyRequest, headerName: string): string | undefined {
  const value = request.headers[headerName.toLowerCase()]; return Array.isArray(value) ? value[0] : (typeof value === 'string' ? value : undefined);
}
export async function registerAnimeCallbacksRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async function scopedCallbackPlugin(callbackApp: FastifyInstance): Promise<void> {
    callbackApp.removeAllContentTypeParsers();
    callbackApp.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => { done(null, body); });
    callbackApp.post('/internal/anime/n8n/callbacks', async (request, reply) => {
      const requestId = (request as any).anime?.request_id ?? randomUUID();
      const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
      const result = await handleCallbackRequest({ source: 'n8n', rawBody, signatureHeader: readHeader(request, 'x-anime-signature'), timestampHeader: readHeader(request, 'x-anime-timestamp'), nonceHeader: readHeader(request, 'x-anime-nonce'), requestId });
      void reply.status(200); return { data: result, meta: { request_id: requestId } };
    });
    callbackApp.post('/internal/anime/workers/callbacks', async (request, reply) => {
      const requestId = (request as any).anime?.request_id ?? randomUUID();
      const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
      const result = await handleCallbackRequest({ source: 'worker', rawBody, signatureHeader: readHeader(request, 'x-anime-signature'), timestampHeader: readHeader(request, 'x-anime-timestamp'), nonceHeader: readHeader(request, 'x-anime-nonce'), requestId });
      void reply.status(200); return { data: result, meta: { request_id: requestId } };
    });
  });
}
