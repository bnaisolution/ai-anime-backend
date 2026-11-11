import type { FastifyInstance } from 'fastify';
import { animeEnv } from '../config/anime.env';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { buildScopedDbRequest } from './workflowGateway.db';
import { buildProviderRequest } from './workflowGateway.llm';
import { verifyWorkflowGatewayRequest } from './workflowGateway.auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authInvalid(message: string): never {
  throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message });
}

async function resolveCommandBinding(body: any): Promise<{ command_id: string; project_id: string; user_id: string }> {
  const rawCommand = String(body?.command_id || body?.session_id || '').trim();
  const commandId = rawCommand.replace(/^cmd_/, '');
  const projectId = String(body?.project_id || '').trim();
  if (!UUID_RE.test(commandId) || !UUID_RE.test(projectId)) authInvalid('command_id and project_id are required.');
  const { data, error } = await animeSupabase
    .from('api_commands')
    .select('id,project_id,user_id')
    .eq('id', commandId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Command binding lookup failed.' });
  if (!data) throw new AnimeError({ code: AnimeErrorCode.PROJECT_FORBIDDEN, message: 'Command is not bound to the requested project.' });
  return { command_id: data.id, project_id: data.project_id, user_id: data.user_id };
}

async function proxyJson(reply: any, response: Response): Promise<void> {
  const text = await response.text();
  reply.status(response.status);
  const contentType = response.headers.get('content-type');
  if (contentType) reply.header('content-type', contentType);
  reply.send(text);
}

export async function registerAnimeWorkflowGatewayRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/internal/workflow/db', async (request: any, reply: any) => {
    const body = request.body as any;
    if (!body || typeof body !== 'object') authInvalid('Request body is required.');
    const system = body.system_scope === true;
    verifyWorkflowGatewayRequest(request, system);
    const binding = system
      ? { command_id: 'system', project_id: 'system', user_id: 'system' }
      : await resolveCommandBinding(body);
    const scoped = buildScopedDbRequest({
      path: body.path,
      method: body.method,
      body: body.body,
      prefer: body.prefer,
      project_id: binding.project_id,
      user_id: binding.user_id,
      system,
    });
    const url = `${animeEnv.ANIME_SUPABASE_URL}${scoped.path}`;
    const headers: Record<string, string> = {
      apikey: animeEnv.ANIME_SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${animeEnv.ANIME_SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };
    if (scoped.prefer) headers.Prefer = scoped.prefer;
    const init: RequestInit = { method: scoped.method, headers };
    if (scoped.body !== undefined) init.body = JSON.stringify(scoped.body);
    const response = await fetch(url, init);
    await proxyJson(reply, response);
  });

  app.post('/v1/anime/internal/workflow/llm', async (request: any, reply: any) => {
    const body = request.body as any;
    if (!body || typeof body !== 'object') authInvalid('Request body is required.');
    verifyWorkflowGatewayRequest(request, false);
    await resolveCommandBinding(body);
    const providerRequest = buildProviderRequest({ provider: body.provider, path: body.path, body: body.body });
    const response = await fetch(providerRequest.url, {
      method: 'POST',
      headers: providerRequest.headers,
      body: JSON.stringify(body.body),
    });
    await proxyJson(reply, response);
  });
}
