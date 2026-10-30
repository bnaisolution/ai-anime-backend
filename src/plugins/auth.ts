import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';

export interface AuthContext {
  userId: string;
  workspaceId: string;
  email: string;
  role: 'owner_admin' | 'normal_user' | 'trusted_service';
  isServiceIdentity: boolean;
}

declare module 'fastify' {
  interface FastifyRequest { authContext: AuthContext; }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateService: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOwner: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: Array<'owner_admin' | 'normal_user' | 'trusted_service'>) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (fastify) => {
  await fastify.register(fastifyJwt, { secret: env.JWT_SECRET });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return reply.code(401).send({ status: 'failed', errors: [{ category: 'UNAUTHORIZED', message: 'Bearer token required' }] });

    let decoded: { sub?: string; workspace_id?: string; email?: string; role?: string };
    try {
      decoded = fastify.jwt.verify<{ sub?: string; workspace_id?: string; email?: string; role?: string }>(token);
    } catch (_e) {
      return reply.code(401).send({ status: 'failed', errors: [{ category: 'UNAUTHORIZED', message: 'Invalid or expired token' }] });
    }

    const sub = decoded.sub;
    if (!sub) return reply.code(401).send({ status: 'failed', errors: [{ category: 'UNAUTHORIZED', message: 'Token missing subject' }] });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { data: blacklisted, error: blErr } = await fastify.supabase.from('token_blacklist').select('id').eq('token_hash', tokenHash).maybeSingle();
    if (blErr) fastify.log.warn({ err: blErr }, 'Token blacklist check failed (fail-open)');
    if (blacklisted) return reply.code(401).send({ status: 'failed', errors: [{ category: 'UNAUTHORIZED', message: 'Token has been revoked' }] });

    const isOwner = env.OWNER_EMAILS.includes((decoded.email || '').toLowerCase()) || decoded.role === 'owner_admin';
    request.authContext = {
      userId: sub,
      workspaceId: decoded.workspace_id || env.DEFAULT_WORKSPACE_ID,
      email: decoded.email || 'user@bnai.dpdns.org',
      role: isOwner ? 'owner_admin' : 'normal_user',
      isServiceIdentity: false
    };
  });

  fastify.decorate('authenticateService', async (request: FastifyRequest, reply: FastifyReply) => {
    const svcToken = (request.headers['x-service-token'] as string | undefined)?.trim();
    const validTokens = [env.TRUSTED_SERVICE_TOKEN, env.N8N_WEBHOOK_SECRET, process.env.LEGACY_N8N_TOKEN].filter(Boolean) as string[];
    if (!svcToken || !validTokens.includes(svcToken)) return reply.code(401).send({ status: 'failed', errors: [{ category: 'UNAUTHORIZED', message: 'Invalid x-service-token' }] });

    const body = (request.body as Record<string, unknown>) || {};
    request.authContext = {
      userId: typeof body.userId === 'string' && body.userId ? body.userId : env.DEFAULT_USER_ID,
      workspaceId: typeof body.workspaceId === 'string' && body.workspaceId ? body.workspaceId : env.DEFAULT_WORKSPACE_ID,
      email: 'n8n-service@internal.local',
      role: 'trusted_service',
      isServiceIdentity: true
    };
  });

  fastify.decorate('requireOwner', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authContext) return reply.code(401).send({ status: 'failed', errors: [{ category: 'UNAUTHORIZED', message: 'Authentication required' }] });
    if (request.authContext.isServiceIdentity) return reply.code(403).send({ status: 'failed', errors: [{ category: 'FORBIDDEN', message: 'Service identity cannot access owner routes' }] });
    if (request.authContext.role !== 'owner_admin') return reply.code(403).send({ status: 'failed', errors: [{ category: 'FORBIDDEN', message: 'Owner Admin role required' }] });
  });

  fastify.decorate('requireRole', (roles: Array<'owner_admin' | 'normal_user' | 'trusted_service'>) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.authContext) return reply.code(401).send({ status: 'failed', errors: [{ category: 'UNAUTHORIZED', message: 'Authentication required' }] });
      if (!roles.includes(request.authContext.role)) return reply.code(403).send({ status: 'failed', errors: [{ category: 'FORBIDDEN', message: `Role required: ${roles.join('|')}` }] });
    };
  });
});
