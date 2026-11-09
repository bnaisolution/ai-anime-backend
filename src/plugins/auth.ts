import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';
import { decodeJwt, isSupabaseIssuer, verifySupabaseJwt } from '../modules/auth/supabase.auth';

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
    authenticateOptional: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateService: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOwner: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: Array<'owner_admin' | 'normal_user' | 'trusted_service'>) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

interface VerifiedJwtPayload {
  sub?: string;
  workspace_id?: string;
  email?: string;
  role?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

function unauthorized(reply: FastifyReply, message: string): void {
  void reply.code(401).send({ status: 'failed', errors: [{ category: 'UNAUTHORIZED', message }] });
}

export default fp(async (fastify) => {
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: {
      algorithm: 'HS256',
      iss: env.JWT_ISSUER,
      aud: env.JWT_AUDIENCE,
      expiresIn: env.JWT_EXPIRES_IN,
    },
    verify: {
      algorithms: ['HS256'],
      allowedIss: env.JWT_ISSUER,
      allowedAud: env.JWT_AUDIENCE,
      requiredClaims: ['iss', 'aud', 'exp', 'sub'],
      maxAge: env.JWT_EXPIRES_IN,
    },
  });

  const verifyUserBearer = async (request: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
    const authHeader = typeof request.headers.authorization === 'string' ? request.headers.authorization : '';
    if (!authHeader) return false;

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      unauthorized(reply, 'Invalid authorization header');
      return false;
    }

    let decoded: VerifiedJwtPayload;
    try {
      const unverified = decodeJwt(token).payload;
      if (isSupabaseIssuer(unverified.iss)) {
        decoded = await verifySupabaseJwt(token) as VerifiedJwtPayload;
      } else if (env.AUTH_INTERNAL_JWT_ENABLED) {
        decoded = fastify.jwt.verify<VerifiedJwtPayload>(token);
      } else {
        unauthorized(reply, 'Invalid or expired token');
        return false;
      }
    } catch (_e) {
      unauthorized(reply, 'Invalid or expired token');
      return false;
    }

    const sub = typeof decoded.sub === 'string' ? decoded.sub.trim() : '';
    if (!sub) {
      unauthorized(reply, 'Token missing subject');
      return false;
    }
    if (decoded.role === 'trusted_service' || decoded.role === 'service_role') {
      unauthorized(reply, 'Service identities cannot authenticate as users');
      return false;
    }
    if (typeof decoded.exp !== 'number' || decoded.exp * 1000 <= Date.now()) {
      unauthorized(reply, 'Invalid or expired token');
      return false;
    }

    const appMetadata = decoded.app_metadata && typeof decoded.app_metadata === 'object' ? decoded.app_metadata : {};
    const userMetadata = decoded.user_metadata && typeof decoded.user_metadata === 'object' ? decoded.user_metadata : {};
    const email = typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : '';
    const workspaceId = typeof decoded.workspace_id === 'string'
      ? decoded.workspace_id
      : typeof appMetadata.workspace_id === 'string'
        ? appMetadata.workspace_id
        : typeof userMetadata.workspace_id === 'string'
          ? userMetadata.workspace_id
          : '';
    const isOwner = email !== '' && env.OWNER_EMAILS.includes(email);

    request.authContext = {
      userId: sub,
      workspaceId,
      email,
      role: isOwner ? 'owner_admin' : 'normal_user',
      isServiceIdentity: false
    };
    return true;
  };

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const authenticated = await verifyUserBearer(request, reply);
    if (!authenticated && !reply.sent) {
      unauthorized(reply, 'Bearer token required');
    }
  });

  fastify.decorate('authenticateOptional', async (request: FastifyRequest, reply: FastifyReply) => {
    await verifyUserBearer(request, reply);
  });

  fastify.decorate('authenticateService', async (request: FastifyRequest, reply: FastifyReply) => {
    const svcToken = (request.headers['x-service-token'] as string | undefined)?.trim();
    const validTokens = [env.TRUSTED_SERVICE_TOKEN, env.N8N_WEBHOOK_SECRET, process.env.LEGACY_N8N_TOKEN]
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (!svcToken || !validTokens.includes(svcToken)) {
      unauthorized(reply, 'Invalid x-service-token');
      return;
    }

    request.authContext = {
      userId: 'service:trusted',
      workspaceId: '',
      email: 'service@internal.invalid',
      role: 'trusted_service',
      isServiceIdentity: true
    };
  });

  fastify.decorate('requireOwner', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authContext) {
      unauthorized(reply, 'Authentication required');
      return;
    }
    if (request.authContext.isServiceIdentity) {
      void reply.code(403).send({ status: 'failed', errors: [{ category: 'FORBIDDEN', message: 'Service identity cannot access owner routes' }] });
      return;
    }
    if (request.authContext.role !== 'owner_admin') {
      void reply.code(403).send({ status: 'failed', errors: [{ category: 'FORBIDDEN', message: 'Owner Admin role required' }] });
    }
  });

  fastify.decorate('requireRole', (roles: Array<'owner_admin' | 'normal_user' | 'trusted_service'>) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.authContext) {
        unauthorized(reply, 'Authentication required');
        return;
      }
      if (!roles.includes(request.authContext.role)) {
        void reply.code(403).send({ status: 'failed', errors: [{ category: 'FORBIDDEN', message: `Role required: ${roles.join('|')}` }] });
      }
    };
  });
});
