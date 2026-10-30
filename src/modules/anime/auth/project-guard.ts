import type { FastifyReply, FastifyRequest } from 'fastify';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export function extractUserId(request: FastifyRequest): string | null {
  const reqAny = request as any;
  return (
    reqAny.anime?.user_id ||
    reqAny.authContext?.userId ||
    reqAny.user?.sub ||
    reqAny.user?.id ||
    reqAny.user?.user_id ||
    null
  );
}

export function requireProjectRole(allowedRoles: string[]) {
  return async function projectRolePreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const reqAny = request as any;
    if (!extractUserId(request) && typeof (request.server as any).authenticate === 'function') {
      try {
        await (request.server as any).authenticate(request, reply);
      } catch (_e) {}
    }

    const authenticatedUserId = extractUserId(request);
    if (!authenticatedUserId) {
      throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Missing or invalid authentication token.' });
    }

    const projectId = reqAny.params?.id || reqAny.params?.project_id || reqAny.body?.project_id || reqAny.query?.project_id;

    if (!projectId) {
      throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Missing project_id.' });
    }

    const { data, error } = await animeSupabase.from('projects').select('id, user_id').eq('id', projectId).maybeSingle();

    if (error || !data) {
      throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Project not found or access denied.' });
    }

    if (!data.user_id) {
      await animeSupabase.from('projects').update({ user_id: authenticatedUserId }).eq('id', projectId);
    } else if (data.user_id !== authenticatedUserId) {
      throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Cross-project access denied.' });
    }

    if (!allowedRoles.includes('owner')) {
      throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Insufficient role.' });
    }

    reqAny.anime = { ...reqAny.anime, user_id: authenticatedUserId, project_id: projectId, role: 'owner' };
  };
}
