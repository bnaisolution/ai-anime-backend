import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { requireProjectRole } from '../auth/project-guard';
import { registerFcmToken } from './devices.service';
export async function registerAnimeDevicesRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/devices/fcm-tokens', { schema: { body: Type.Object({ project_id: Type.String({ format: 'uuid' }), token: Type.String({ minLength: 16 }), platform: Type.Optional(Type.String()) }) }, preHandler: [requireProjectRole(['owner', 'admin', 'editor', 'reviewer', 'viewer'])] }, async (req: any) => { return { data: await registerFcmToken(req.anime?.user_id, req.body.token, req.body) }; });
}
