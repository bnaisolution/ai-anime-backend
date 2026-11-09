import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  isSupabaseAuthConfigured,
  refreshSession,
  revokeSession,
  signInWithPassword,
  SupabaseAuthError,
  type SupabaseSession,
} from './supabase.auth';

function bearerToken(request: FastifyRequest): string {
  const header = typeof request.headers.authorization === 'string' ? request.headers.authorization : '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function invalid(reply: FastifyReply, category: string, message: string, statusCode = 400): void {
  void reply.code(statusCode).send({
    status: 'failed',
    errors: [{ category, message }],
  });
}

function sendAuthError(reply: FastifyReply, error: unknown): void {
  if (error instanceof SupabaseAuthError) {
    invalid(reply, error.category, error.message, error.httpStatus);
    return;
  }
  invalid(reply, 'AUTH_UPSTREAM_UNAVAILABLE', 'Authentication failed', 503);
}

function sessionResponse(session: SupabaseSession): Record<string, unknown> {
  return {
    status: 'completed',
    token: session.accessToken,
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_in: session.expiresIn,
    token_type: session.tokenType,
    user_id: session.userId,
    userId: session.userId,
    workspace_id: session.workspaceId,
    workspaceId: session.workspaceId,
    email: session.email,
    role: session.role,
    user: {
      id: session.userId,
      email: session.email,
      workspace_id: session.workspaceId,
      role: session.role,
    },
  };
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password || !email.includes('@')) {
      invalid(reply, 'VALIDATION_ERROR', 'A valid email and password are required.');
      return;
    }
    if (!isSupabaseAuthConfigured()) {
      invalid(reply, 'AUTH_NOT_CONFIGURED', 'Supabase Auth is not configured.', 503);
      return;
    }
    try {
      const session = await signInWithPassword(email, password);
      void reply.code(200).send(sessionResponse(session));
    } catch (error) {
      sendAuthError(reply, error);
    }
  });

  fastify.post('/refresh', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const refreshToken = typeof body.refresh_token === 'string'
      ? body.refresh_token.trim()
      : typeof body.refreshToken === 'string'
        ? body.refreshToken.trim()
        : '';
    if (!refreshToken) {
      invalid(reply, 'VALIDATION_ERROR', 'A refresh token is required.');
      return;
    }
    if (!isSupabaseAuthConfigured()) {
      invalid(reply, 'AUTH_NOT_CONFIGURED', 'Supabase Auth is not configured.', 503);
      return;
    }
    try {
      const session = await refreshSession(refreshToken);
      void reply.code(200).send(sessionResponse(session));
    } catch (error) {
      sendAuthError(reply, error);
    }
  });

  fastify.post('/logout', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const token = bearerToken(request);
    if (!token) {
      invalid(reply, 'AUTH_INVALID', 'A valid bearer token is required.', 401);
      return;
    }
    if (!isSupabaseAuthConfigured()) {
      invalid(reply, 'AUTH_NOT_CONFIGURED', 'Supabase Auth is not configured.', 503);
      return;
    }
    try {
      await revokeSession(token);
      void reply.code(200).send({ status: 'completed' });
    } catch (error) {
      sendAuthError(reply, error);
    }
  });

  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request) => {
    return { status: 'completed', user: request.authContext };
  });
}
