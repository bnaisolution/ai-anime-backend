import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { animeSupabase } from '../db/anime.supabase';
import { verifyWorkerJobToken } from '../workers/workerToken';
import { verifyWorkerServiceRequest } from '../workers/workerServiceAuth';
import { verifyWorkflowGatewayRequest } from './workflowGateway.auth';
import { resolveCommandBinding } from './workflowGateway.routes';

const PATH_SCOPES: Record<string, 'tts' | 'ffmpeg'> = {
  '/v1/tts/svara': 'tts',
  '/v1/tts/supertonic': 'tts',
  '/v1/ffmpeg/render-episode': 'ffmpeg',
};
const GPU_SESSION_NAMES = new Set(['kaggle_story_engine', 'kaggle_secondary_engine']);
const TUNNEL_HOST_SUFFIXES = ['.trycloudflare.com', '.loca.lt'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CPU_WAIT_MS = 570000;
const CPU_JOB_MAX_AGE_MS = 900000;
const TTS_WAIT_MS = 120000;
const CLAIM_LEASE_SECONDS = 1800;

function invalid(message: string): never {
  throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message });
}

function validatePath(path: unknown): string {
  const value = String(path || '');
  if (!value.startsWith('/') || value.includes('..') || value.includes('//') || value.includes('http')) invalid('Worker path is not allowed.');
  if (!PATH_SCOPES[value]) invalid('Worker path is not in the Anime allowlist.');
  return value;
}

function bearerToken(request: any): string {
  const header = String(request?.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) invalid('Worker token is required.');
  return match[1].trim();
}

function validateTunnelEndpoint(value: unknown): string {
  let url: URL;
  try { url = new URL(String(value || '')); } catch { invalid('Tunnel endpoint must be a valid URL.'); }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || host.length > 253
    || !TUNNEL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    invalid('Tunnel endpoint must be a public HTTPS URL.');
  }
  return url.toString().replace(/\/+$/, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enqueueWorkerJob(input: {
  command_id: string;
  project_id: string;
  user_id: string;
  tenant_id: string | null;
  path: string;
  payload: Record<string, unknown>;
}): Promise<string> {
  const jobId = randomUUID();
  const { error } = await animeSupabase.from('worker_jobs').insert({
    id: jobId,
    command_id: input.command_id,
    project_id: input.project_id,
    user_id: input.user_id,
    tenant_id: input.tenant_id,
    worker_kind: 'cpu',
    path: input.path,
    payload: { ...input.payload, job_id: jobId },
    status: 'queued',
    attempts: 0,
  });
  if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to enqueue CPU worker job.', cause: error });
  return jobId;
}

async function waitForWorkerJob(jobId: string, timeoutMs: number): Promise<{ failed: boolean; result?: unknown; error?: string; httpStatus?: number }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data, error } = await animeSupabase
      .from('worker_jobs')
      .select('status,result,error,http_status')
      .eq('id', jobId)
      .maybeSingle<{ status: string; result: unknown; error: string | null; http_status: number | null }>();
    if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to read CPU worker job.', cause: error });
    if (!data) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'CPU worker job disappeared.' });
    if (data.status === 'completed') return { failed: false, result: data.result };
    if (data.status === 'failed') return { failed: true, error: data.error || 'CPU worker job failed.', httpStatus: data.http_status || 502 };
    await sleep(500);
  }
  return { failed: true, error: 'CPU worker job timed out.', httpStatus: 504 };
}

export async function registerAnimeWorkflowWorkerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/internal/worker/session', async (request: any) => {
    const claims = verifyWorkerJobToken(bearerToken(request), 'gpu_session');
    const body = request.body as any;
    if (!body || typeof body !== 'object') invalid('Session body is required.');
    const sessionName = String(body.session_name || '').trim();
    if (!GPU_SESSION_NAMES.has(sessionName)) invalid('Session name is not allowed.');
    const endpoint = validateTunnelEndpoint(body.api_endpoint);
    const { error } = await animeSupabase.from('kaggle_sessions').upsert({
      user_id: claims.user_id,
      tenant_id: claims.tenant_id ?? null,
      session_name: sessionName,
      status: 'active',
      api_endpoint: endpoint,
      gpu_id: typeof body.gpu_id === 'string' ? body.gpu_id.slice(0, 40) : null,
      worker_token: bearerToken(request),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,session_name' });
    if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Session registration failed.', cause: error });
    return { data: { ok: true, session_name: sessionName } };
  });

  app.post('/v1/anime/internal/worker/session/closed', async (request: any) => {
    const claims = verifyWorkerJobToken(bearerToken(request), 'gpu_session');
    const body = request.body as any;
    if (!body || typeof body !== 'object') invalid('Session body is required.');
    const sessionName = String(body.session_name || '').trim();
    if (!GPU_SESSION_NAMES.has(sessionName)) invalid('Session name is not allowed.');
    const { error } = await animeSupabase
      .from('kaggle_sessions')
      .update({ status: 'stopped', api_endpoint: null, updated_at: new Date().toISOString() })
      .eq('user_id', claims.user_id)
      .eq('session_name', sessionName);
    if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Session close failed.', cause: error });
    return { data: { ok: true, session_name: sessionName, reason: String(body.reason || '').slice(0, 80) } };
  });

  app.post('/v1/anime/internal/workflow/worker', async (request: any, reply: any) => {
    const body = request.body as any;
    if (!body || typeof body !== 'object') invalid('Worker request body is required.');
    verifyWorkflowGatewayRequest(request, false);
    if (String(body.worker_kind || 'cpu').toLowerCase() !== 'cpu') {
      throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'Only the CPU worker gateway is implemented.', retryable: false });
    }
    const binding = await resolveCommandBinding(body);
    const path = validatePath(body.path);
    if (!body.body || typeof body.body !== 'object' || Array.isArray(body.body)) invalid('Worker request body must be an object.');
    const payload = {
      ...body.body,
      command_id: binding.command_id,
      project_id: binding.project_id,
      user_id: binding.user_id,
      tenant_id: null,
    };
    const jobId = await enqueueWorkerJob({
      command_id: binding.command_id,
      project_id: binding.project_id,
      user_id: binding.user_id,
      tenant_id: null,
      path,
      payload,
    });
    const responseBase = { job_id: jobId, command_id: binding.command_id, project_id: binding.project_id, status: 'queued' };
    if (body.async === true) {
      return reply.status(202).send(responseBase);
    }
    const outcome = await waitForWorkerJob(jobId, path === '/v1/ffmpeg/render-episode' ? CPU_WAIT_MS : TTS_WAIT_MS);
    if (outcome.failed) {
      return reply.status(outcome.httpStatus || 502).send({
        ...responseBase,
        status: 'failed',
        error: outcome.error || 'CPU worker job failed.',
      });
    }
    return outcome.result;
  });

  app.get('/v1/anime/internal/workflow/worker/status', async (request: any, reply: any) => {
    verifyWorkflowGatewayRequest(request, false);
    const query = (request.query || {}) as any;
    const jobId = String(query.job_id || '').trim();
    const commandId = String(query.command_id || '').trim();
    const projectId = String(query.project_id || '').trim();
    if (!UUID_RE.test(jobId) || !UUID_RE.test(commandId) || !UUID_RE.test(projectId)) invalid('job_id, command_id and project_id are required.');
    const { data, error } = await animeSupabase
      .from('worker_jobs')
      .select('id,status,result,error,http_status,created_at,completed_at')
      .eq('id', jobId)
      .eq('command_id', commandId)
      .eq('project_id', projectId)
      .maybeSingle<{ id: string; status: string; result: unknown; error: string | null; http_status: number | null; created_at: string; completed_at: string | null }>();
    if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to read CPU worker job status.', cause: error });
    if (!data) throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'CPU worker job not found.', httpStatus: 404 });
    if (data.status === 'failed') {
      return reply.status(data.http_status || 502).send({
        job_id: data.id,
        command_id: commandId,
        project_id: projectId,
        status: data.status,
        error: data.error || 'CPU worker job failed.',
      });
    }
    const ageMs = Date.now() - new Date(data.created_at).getTime();
    if (!['completed', 'failed'].includes(data.status) && ageMs > CPU_JOB_MAX_AGE_MS) {
      return reply.status(504).send({
        job_id: data.id,
        command_id: commandId,
        project_id: projectId,
        status: 'timeout',
        error: 'CPU worker job timed out.',
      });
    }
    return {
      job_id: data.id,
      command_id: commandId,
      project_id: projectId,
      status: data.status,
      result: data.result,
      error: data.error,
      created_at: data.created_at,
      completed_at: data.completed_at,
    };
  });

  app.post('/v1/anime/internal/worker/jobs/claim', async (request: any, reply: any) => {
    verifyWorkerServiceRequest(request);
    const body = request.body as any;
    const workerId = String(body?.worker_id || '').trim();
    if (!workerId || workerId.length > 128) invalid('worker_id is required.');
    const leaseSeconds = Number(body?.lease_seconds ?? CLAIM_LEASE_SECONDS);
    if (!Number.isFinite(leaseSeconds) || leaseSeconds < 60 || leaseSeconds > 3600) invalid('lease_seconds is out of range.');
    const { data, error } = await animeSupabase.rpc('claim_worker_job', {
      p_worker_id: workerId,
      p_lease_seconds: Math.trunc(leaseSeconds),
    });
    if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to claim CPU worker job.', cause: error });
    const job = Array.isArray(data) ? data[0] : data;
    if (!job) return reply.status(204).send();
    return {
      job: {
        id: job.id,
        command_id: job.command_id,
        project_id: job.project_id,
        user_id: job.user_id,
        tenant_id: job.tenant_id,
        path: job.path,
        payload: job.payload,
        attempts: job.attempts,
      },
    };
  });

  app.post('/v1/anime/internal/worker/jobs/:job_id/complete', async (request: any, reply: any) => {
    verifyWorkerServiceRequest(request);
    const jobId = String(request.params?.job_id || '').trim();
    if (!UUID_RE.test(jobId)) invalid('job_id is required.');
    const body = request.body as any;
    const workerId = String(body?.worker_id || '').trim();
    const status = String(body?.status || '').trim().toLowerCase();
    if (!workerId) invalid('worker_id is required.');
    if (!['completed', 'failed'].includes(status)) invalid('status must be completed or failed.');
    const httpStatus = Number(body?.http_status ?? (status === 'completed' ? 200 : 502));
    const result = status === 'completed' && body?.result && typeof body.result === 'object' ? body.result : null;
    const errorMessage = status === 'failed' ? String(body?.error || 'CPU worker job failed.').slice(0, 4000) : null;
    const { data, error } = await animeSupabase
      .from('worker_jobs')
      .update({
        status,
        result,
        error: errorMessage,
        http_status: Number.isFinite(httpStatus) ? Math.trunc(httpStatus) : 502,
        payload: null,
        lease_expires_at: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('status', 'processing')
      .eq('worker_id', workerId)
      .select('id,status')
      .maybeSingle<{ id: string; status: string }>();
    if (error) throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Failed to complete CPU worker job.', cause: error });
    if (!data) {
      const { data: existing } = await animeSupabase.from('worker_jobs').select('status').eq('id', jobId).maybeSingle<{ status: string }>();
      if (existing && ['completed', 'failed'].includes(existing.status)) {
        return { ok: true, duplicate: true, job_id: jobId, status: existing.status };
      }
      throw new AnimeError({ code: AnimeErrorCode.CALLBACK_REPLAY, message: 'Worker job is not owned by this worker.', httpStatus: 409 });
    }
    return { ok: true, job_id: jobId, status };
  });
}
