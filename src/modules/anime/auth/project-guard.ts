import type { FastifyReply, FastifyRequest } from 'fastify';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

const PROJECT_ROLES = new Set(['owner', 'admin', 'editor', 'reviewer', 'viewer']);
const IDENTITY_FIELDS = ['user_id', 'userId', 'owner_id'];

function projectForbidden(message: string): AnimeError {
  return new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message });
}

function readIdentityOverride(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function extractUserId(request: FastifyRequest): string | null {
  const authContext = (request as any).authContext;
  if (!authContext || authContext.isServiceIdentity === true) return null;
  const userId = typeof authContext.userId === 'string' ? authContext.userId.trim() : '';
  return userId || null;
}

function assertNoIdentitySubstitution(request: FastifyRequest, authenticatedUserId: string): void {
  const reqAny = request as any;
  const headerUserId = readIdentityOverride(reqAny.headers?.['x-user-id']);
  if (headerUserId && headerUserId !== authenticatedUserId) {
    throw projectForbidden('Authenticated identity cannot be overridden by headers.');
  }

  for (const field of IDENTITY_FIELDS) {
    const bodyValue = readIdentityOverride(reqAny.body?.[field]);
    if (bodyValue && bodyValue !== authenticatedUserId) {
      throw projectForbidden('Authenticated identity cannot be overridden by request body.');
    }
    const queryValue = readIdentityOverride(reqAny.query?.[field]);
    if (queryValue && queryValue !== authenticatedUserId) {
      throw projectForbidden('Authenticated identity cannot be overridden by query parameters.');
    }
  }
}

function extractProjectId(request: FastifyRequest): string | null {
  const reqAny = request as any;
  const pathId = typeof reqAny.params?.id === 'string'
    ? reqAny.params.id
    : (typeof reqAny.params?.project_id === 'string' ? reqAny.params.project_id : null);
  const bodyId = typeof reqAny.body?.project_id === 'string' ? reqAny.body.project_id : null;
  const queryId = typeof reqAny.query?.project_id === 'string' ? reqAny.query.project_id : null;
  const headerId = readIdentityOverride(reqAny.headers?.['x-project-id']);

  if (pathId && bodyId && pathId !== bodyId) {
    throw projectForbidden('Project id in request body does not match the project route.');
  }
  if (pathId && queryId && pathId !== queryId) {
    throw projectForbidden('Project id in query parameters does not match the project route.');
  }
  if (!pathId && bodyId && queryId && bodyId !== queryId) {
    throw projectForbidden('Project id in body and query parameters does not match.');
  }

  const resolvedProjectId = pathId || bodyId || queryId;
  if (headerId && resolvedProjectId && headerId !== resolvedProjectId) {
    throw projectForbidden('Project id header does not match the authorized project.');
  }

  return resolvedProjectId;
}

function resolveProjectRole(authContext: any, isOwner: boolean): string | null {
  const claimedRole = typeof authContext?.role === 'string' ? authContext.role : '';
  if (PROJECT_ROLES.has(claimedRole)) return claimedRole;
  if (claimedRole === 'owner_admin' || claimedRole === 'normal_user') {
    return isOwner ? 'owner' : null;
  }
  return null;
}

export function requireProjectRole(allowedRoles: string[]) {
  const permittedRoles = new Set(allowedRoles);

  return async function projectRolePreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    let authenticatedUserId = extractUserId(request);

    if (!authenticatedUserId && typeof (request.server as any).authenticate === 'function') {
      await (request.server as any).authenticate(request, reply);
      if ((reply as any).sent) return;
      authenticatedUserId = extractUserId(request);
    }

    if (!authenticatedUserId) {
      throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Missing or invalid authentication token.' });
    }

    assertNoIdentitySubstitution(request, authenticatedUserId);

    const projectId = extractProjectId(request);
    if (!projectId) {
      throw projectForbidden('Missing project_id.');
    }

    const { data, error } = await animeSupabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .maybeSingle();

    if (error || !data) {
      throw projectForbidden('Project not found or access denied.');
    }

    if (!data.user_id) {
      throw projectForbidden('Project has no verified owner.');
    }

    if (data.user_id !== authenticatedUserId) {
      throw projectForbidden('Cross-project access denied.');
    }

    const projectRole = resolveProjectRole((request as any).authContext, true);
    if (!projectRole || !permittedRoles.has(projectRole)) {
      throw projectForbidden('Insufficient role.');
    }

    const reqAny = request as any;
    reqAny.anime = {
      ...reqAny.anime,
      user_id: authenticatedUserId,
      project_id: projectId,
      role: projectRole
    };
  };
}
