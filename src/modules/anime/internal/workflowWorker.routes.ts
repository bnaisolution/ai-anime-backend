import type { FastifyInstance } from 'fastify';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { getHydratedInfrastructureForUser } from '../infrastructure/infrastructure.service';
import { mintWorkerJobToken, type WorkerJobScope } from '../workers/workerToken';
import { verifyWorkflowGatewayRequest } from './workflowGateway.auth';
import { resolveCommandBinding } from './workflowGateway.routes';

const PATH_SCOPES: Record<string, WorkerJobScope> = {
  '/v1/tts/svara': 'tts',
  '/v1/tts/supertonic': 'tts',
  '/v1/ffmpeg/render-episode': 'ffmpeg',
};
const BLOCKED_HOSTS = new Set(['169.254.169.254', 'metadata.google.internal', 'metadata', '0.0.0.0', '[::]', '::']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function invalid(message: string): never {
  throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message });
}

async function resolveCpuWorkerUrl(userId: string): Promise<string> {
  let infra: any = {};
  try { infra = await getHydratedInfrastructureForUser(userId); } catch (_error) { infra = {}; }
  const candidates = [
    infra.github_worker?.worker_url,
    infra.tts?.worker_url,
    infra.ffmpeg?.worker_url,
    process.env.GITHUB_WORKER_URL,
    process.env.TTS_WORKER_URL,
    process.env.FFMPEG_WORKER_URL,
  ];
  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  if (!value) {
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'CPU worker is not configured for this command.', retryable: false });
  }
  let url: URL;
  try {
    url = new URL(String(value).trim());
  } catch (_error) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'CPU worker URL is not allowed.' });
  }
  const host = url.hostname.toLowerCase();
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || BLOCKED_HOSTS.has(host)
    || host.startsWith('169.254.')
    || host.startsWith('fe80:')
    || (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(host))
  ) {
    throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message: 'CPU worker URL is not allowed.' });
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function validatePath(path: unknown): { path: string; scope: WorkerJobScope } {
  const value = String(path || '');
  if (!value.startsWith('/') || value.includes('..') || value.includes('//') || value.includes('http')) invalid('Worker path is not allowed.');
  const scope = PATH_SCOPES[value];
  if (!scope) invalid('Worker path is not in the Anime allowlist.');
  return { path: value, scope };
}

async function proxyJson(reply: any, response: Response): Promise<void> {
  const text = await response.text();
  reply.status(response.status);
  const contentType = response.headers.get('content-type');
  if (contentType) reply.header('content-type', contentType);
  reply.send(text);
}

export async function registerAnimeWorkflowWorkerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/internal/workflow/worker', async (request: any, reply: any) => {
    const body = request.body as any;
    if (!body || typeof body !== 'object') invalid('Worker request body is required.');
    verifyWorkflowGatewayRequest(request, false);
    if (String(body.worker_kind || 'cpu').toLowerCase() !== 'cpu') {
      throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'Only the CPU worker gateway is implemented.', retryable: false });
    }
    const binding = await resolveCommandBinding(body);
    const { path, scope } = validatePath(body.path);
    if (!body.body || typeof body.body !== 'object' || Array.isArray(body.body)) invalid('Worker request body must be an object.');
    const workerUrl = await resolveCpuWorkerUrl(binding.user_id);
    const token = mintWorkerJobToken({
      job_id: binding.command_id,
      project_id: binding.project_id,
      tenant_id: null,
      user_id: binding.user_id,
      scope: [scope],
      ttl_seconds: 300,
    });
    const workerBody = {
      ...body.body,
      job_id: binding.command_id,
      project_id: binding.project_id,
      user_id: binding.user_id,
      tenant_id: null,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240000);
    let response: Response;
    try {
      response = await fetch(`${workerUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify(workerBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    await proxyJson(reply, response);
  });
}
