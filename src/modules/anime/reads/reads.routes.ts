import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { extractUserId, requireProjectRole } from '../auth/project-guard';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { getEpisode, getEpisodePlan, listEpisodes } from './episodes.service';
import { getJob, listJobs } from './jobs.service';
import { getProject, getProjectOverview, listProjects } from './projects.service';
import { listScenes } from './scenes.service';

const READ_ROLES = ['owner', 'admin', 'editor', 'reviewer', 'viewer'];
const CursorSchema = Type.Object({ cursor: Type.Optional(Type.String()), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })) });
const ProjSchema = Type.Object({ id: Type.String({ format: 'uuid' }) });
const EpSchema = Type.Object({ id: Type.String({ format: 'uuid' }), episodeNo: Type.Integer({ minimum: 1 }) });
const JobSchema = Type.Object({ id: Type.String({ format: 'uuid' }), jobId: Type.String({ format: 'uuid' }) });

export async function registerAnimeReadsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/projects', { schema: { querystring: CursorSchema } }, async (request: any, reply: any) => {
    if (!extractUserId(request) && typeof (app as any).authenticate === 'function') { try { await (app as any).authenticate(request, reply); } catch (_e) {} }
    const userId = extractUserId(request);
    if (!userId) throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'Missing auth token.' });
    return { data: (await listProjects(userId, request.query)).items };
  });
  app.get('/v1/anime/projects/:id', { schema: { params: ProjSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: await getProject(request.params.id, extractUserId(request)!) }; });
  app.get('/v1/anime/projects/:id/overview', { schema: { params: ProjSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: await getProjectOverview(request.params.id, extractUserId(request)!) }; });
  app.get('/v1/anime/projects/:id/episodes', { schema: { params: ProjSchema, querystring: CursorSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: (await listEpisodes(request.params.id, request.query)).items }; });
  app.get('/v1/anime/projects/:id/episodes/:episodeNo', { schema: { params: EpSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: await getEpisode(request.params.id, request.params.episodeNo) }; });
  app.get('/v1/anime/projects/:id/episodes/:episodeNo/plan', { schema: { params: EpSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: await getEpisodePlan(request.params.id, request.params.episodeNo) }; });
  app.get('/v1/anime/projects/:id/episodes/:episodeNo/scenes', { schema: { params: EpSchema, querystring: CursorSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: (await listScenes(request.params.id, request.params.episodeNo, request.query)).items }; });
  app.get('/v1/anime/projects/:id/jobs', { schema: { params: ProjSchema, querystring: CursorSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: (await listJobs(request.params.id, request.query)).items }; });
  app.get('/v1/anime/projects/:id/jobs/:jobId', { schema: { params: JobSchema }, preHandler: [requireProjectRole(READ_ROLES)] }, async (request: any) => { return { data: await getJob(request.params.id, request.params.jobId) }; });
}
