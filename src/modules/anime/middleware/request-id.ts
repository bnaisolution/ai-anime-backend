import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
export type AnimeRole = 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer';
export async function animeRequestIdHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const requestId = randomUUID(); (req as any).anime = { ...(req as any).anime, request_id: requestId }; reply.header('X-Request-Id', requestId);
}
