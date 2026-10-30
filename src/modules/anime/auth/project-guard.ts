import type { FastifyReply, FastifyRequest } from 'fastify';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
export function requireProjectRole(allowedRoles: string[]) {
  return async function projectRolePreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authCtx = (request as any).authContext;
    const authenticatedUserId = authCtx?.userId;
    if (!authenticatedUserId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Missing auth context.' });
    const projectId = (request.params as any)?.id || (request.params as any)?.project_id || (request.body as any)?.project_id;
    if (!projectId) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Missing project_id.' });
    const { data, error } = await animeSupabase.from('projects').select('id, user_id').eq('id', projectId).single();
    if (error || !data || data.user_id !== authenticatedUserId) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Access denied.' });
    if (!allowedRoles.includes('owner')) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Insufficient role.' });
    (request as any).anime = { ...(request as any).anime, user_id: authenticatedUserId, project_id: projectId, role: 'owner' };
  };
}
