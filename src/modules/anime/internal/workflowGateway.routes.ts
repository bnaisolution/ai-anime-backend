import type { FastifyInstance } from 'fastify';
import { animeEnv } from '../config/anime.env';
import { animeSupabase } from '../db/anime.supabase';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { buildScopedDbRequest, GLOBAL_READ_TABLES } from './workflowGateway.db';
import { executeTenantDbRequest, hasOffset, mergeTenantRows, type TenantDbResult } from './workflowGateway.tenantDb';
import { buildProviderRequest } from './workflowGateway.llm';
import { verifyWorkflowGatewayRequest } from './workflowGateway.auth';
import { getDecryptedMapForUser } from '../infrastructure/infrastructure.service';
import { estimateTokens, reserveTokenBudget } from '../../../core/ai-brain/modelRouter';
import { incrementCounter } from '../observability/metrics';
import * as tenantDb from '../tenant/tenantDatabase.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authInvalid(message: string): never {
  throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message });
}

export async function resolveCommandBinding(body: any): Promise<{ command_id: string; project_id: string; user_id: string }> {
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

function jsonResult(status: number, body: unknown): TenantDbResult {
  return { status, contentType: 'application/json; charset=utf-8', text: JSON.stringify(body), body };
}

function sendGatewayResult(reply: any, result: TenantDbResult): void {
  reply.status(result.status);
  if (result.contentType) reply.header('content-type', result.contentType);
  reply.send(result.text || undefined);
}

function assertGatewaySuccess(result: TenantDbResult): void {
  if (result.status >= 200 && result.status < 300) return;
  throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Database request failed.' });
}

function requireTenantDsn(plane: { central: boolean; dsn: string | null }): string {
  if (plane.central || !plane.dsn) {
    throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Tenant database is not configured.' });
  }
  return plane.dsn;
}

async function proxyJson(reply: any, response: Response): Promise<void> {
  const text = await response.text();
  reply.status(response.status);
  const contentType = response.headers.get('content-type');
  if (contentType) reply.header('content-type', contentType);
  reply.send(text || undefined);
}

async function fetchCentralDb(scoped: ReturnType<typeof buildScopedDbRequest>): Promise<TenantDbResult> {
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
  const text = await response.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    text,
    body,
  };
}

async function executeSystemRequest(scoped: ReturnType<typeof buildScopedDbRequest>): Promise<TenantDbResult> {
  const planes = await tenantDb.listActiveByodDataPlanes();
  if (planes.length === 0) return fetchCentralDb(scoped);
  if (scoped.method === 'GET') {
    if (hasOffset(scoped.path)) {
      throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Paged system gateway reads are not supported.' });
    }
    const results = await Promise.all([
      fetchCentralDb(scoped),
      ...planes.map((plane) => executeTenantDbRequest(scoped, requireTenantDsn(plane))),
    ]);
    results.forEach(assertGatewaySuccess);
    const rows = results.flatMap((result) => Array.isArray(result.body) ? result.body : []);
    return jsonResult(200, mergeTenantRows(rows, scoped.path));
  }
  if (scoped.method === 'PATCH') {
    const results = await Promise.all([
      fetchCentralDb(scoped),
      ...planes.map((plane) => executeTenantDbRequest(scoped, requireTenantDsn(plane))),
    ]);
    results.forEach(assertGatewaySuccess);
    if (String(scoped.prefer || '').toLowerCase().includes('return=representation')) {
      const rows = results.flatMap((result) => Array.isArray(result.body) ? result.body : []);
      return jsonResult(200, rows);
    }
    return { status: 204, contentType: null, text: '', body: null };
  }

  const rows = Array.isArray(scoped.body) ? scoped.body : [scoped.body];
  const groups = new Map<string, { plane: Awaited<ReturnType<typeof tenantDb.resolveProjectDataPlaneById>> | null; rows: any[] }>();
  const projectPlanes = new Map<string, Awaited<ReturnType<typeof tenantDb.resolveProjectDataPlaneById>>>();
  for (const row of rows) {
    const projectId = row && typeof row === 'object' && typeof (row as any).project_id === 'string'
      ? String((row as any).project_id)
      : '';
    let plane = null;
    if (projectId) {
      plane = projectPlanes.get(projectId) ?? await tenantDb.resolveProjectDataPlaneById(projectId);
      projectPlanes.set(projectId, plane);
    }
    const key = plane && !plane.central ? `byod:${plane.tenant_id}` : 'central';
    const group = groups.get(key) ?? { plane, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const results = await Promise.all([...groups.values()].map((group) => {
    const request = { ...scoped, body: group.rows.length === 1 ? group.rows[0] : group.rows };
    return group.plane && !group.plane.central
      ? executeTenantDbRequest(request, requireTenantDsn(group.plane))
      : fetchCentralDb(request);
  }));
  results.forEach(assertGatewaySuccess);
  if (String(scoped.prefer || '').toLowerCase().includes('return=representation')) {
    const written = results.flatMap((result) => Array.isArray(result.body) ? result.body : []);
    return jsonResult(201, written);
  }
  return { status: 201, contentType: null, text: '', body: null };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function mergeActBatch(parsedResponses: any[]): Record<string, any> {
  const acts: any[] = [];
  const beats: any[] = [];
  let nextBeatOrder = 1;
  parsedResponses.forEach((item: any, index: number) => {
    const actText = String(item?.act_text || item?.text || item?.full_script_text || '').trim();
    if (!actText) {
      throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `LLM act batch returned an empty act at position ${index + 1}.` });
    }
    const actBeats = Array.isArray(item?.beats) ? item.beats : [];
    if (actBeats.length === 0) {
      throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `LLM act batch returned no beats for act ${index + 1}.` });
    }
    const beatOrders: number[] = [];
    for (const beat of actBeats) {
      if (!beat || typeof beat !== 'object') continue;
      const groundedBeat = { ...beat, beat_order: nextBeatOrder };
      beatOrders.push(nextBeatOrder);
      nextBeatOrder += 1;
      beats.push(groundedBeat);
    }
    acts.push({ act_index: index + 1, act_text: actText, beat_orders: beatOrders });
  });
  const first = parsedResponses[0] && typeof parsedResponses[0] === 'object' ? parsedResponses[0] : {};
  return {
    title: first.title || '',
    logline: first.logline || '',
    objective: first.objective || '',
    opening_hook: first.opening_hook || '',
    climax: first.climax || '',
    cliffhanger: first.cliffhanger || '',
    estimated_runtime_min: first.estimated_runtime_min,
    full_script_text: acts.map((act) => act.act_text).join('\n\n'),
    acts,
    beats,
  };
}

export async function registerAnimeWorkflowGatewayRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/internal/workflow/db', { config: { rateLimit: false } }, async (request: any, reply: any) => {
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
    if (system) {
      sendGatewayResult(reply, await executeSystemRequest(scoped));
      return;
    }
    const centralOnly = GLOBAL_READ_TABLES.has(scoped.table) || scoped.table === 'kaggle_sessions';
    const plane = centralOnly ? null : await tenantDb.resolveProjectDataPlaneById(binding.project_id);
    const result = plane && !plane.central
      ? await executeTenantDbRequest(scoped, requireTenantDsn(plane))
      : await fetchCentralDb(scoped);
    sendGatewayResult(reply, result);
  });

  app.post('/v1/anime/internal/workflow/llm', { config: { rateLimit: false } }, async (request: any, reply: any) => {
    const body = request.body as any;
    if (!body || typeof body !== 'object') authInvalid('Request body is required.');
    verifyWorkflowGatewayRequest(request, false);
    const binding = await resolveCommandBinding(body);
    const userInfrastructure = await getDecryptedMapForUser(binding.user_id);
    const apiKeyFor = (providerName: string): string | null => {
      const providerConfig = userInfrastructure[String(providerName || '').toLowerCase()];
      return providerConfig && typeof providerConfig === 'object' && typeof providerConfig.api_key === 'string'
        ? providerConfig.api_key
        : null;
    };

    if (Array.isArray(body.batch) && body.batch.length > 0) {
      const batch = body.batch as any[];
      if (batch.length > 12) {
        throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'LLM batch exceeds the supported limit.' });
      }
      const batchMode = String(body.batch_mode || 'scenes').toLowerCase();
      const concurrency = batchMode === 'acts' ? 1 : 2;
      const parsedResponses: any[] = await mapWithConcurrency(batch, concurrency, async (item: any, index: number) => {
        const providerName = String(item.provider || body.provider || '').toLowerCase();
        const providerRequest = buildProviderRequest({
          provider: providerName,
          path: item.path,
          body: item.body,
          apiKey: apiKeyFor(providerName),
        });
        const messages = Array.isArray(item.body?.messages) ? item.body.messages : [];
        const inputText = messages.length > 0
          ? messages.map((message: any) => String(message?.content || '')).join('\n')
          : JSON.stringify(item.body || {});
        const maxTokens = Number(item.body?.max_tokens || item.body?.generationConfig?.maxOutputTokens || 512);
        if (!reserveTokenBudget(estimateTokens(inputText) + Math.min(maxTokens, 2048))) {
          throw new AnimeError({ code: AnimeErrorCode.QUOTA_DEFERRED, message: 'LLM token budget exceeded.', httpStatus: 429, retryable: true });
        }
        const response = await fetch(providerRequest.url, {
          method: 'POST',
          headers: providerRequest.headers,
          body: JSON.stringify(item.body),
        });
        const text = await response.text();
        if (!response.ok) {
          if (response.status === 413) {
            incrementCounter('anime_llm_gateway_failures_total', { status: 413, reason: 'INPUT_TOO_LARGE' });
            throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `LLM batch item ${index + 1} exceeded provider token limit.`, httpStatus: 413, retryable: false });
          }
          if (response.status === 429) {
            incrementCounter('anime_llm_gateway_failures_total', { status: 429, reason: 'QUOTA_DEFERRED' });
            throw new AnimeError({ code: AnimeErrorCode.QUOTA_DEFERRED, message: `LLM batch item ${index + 1} was rate limited.`, httpStatus: 429, retryable: true });
          }
          throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: `LLM batch item ${index + 1} failed with status ${response.status}.`, httpStatus: 503, retryable: true });
        }
        let providerJson: any;
        try {
          providerJson = JSON.parse(text);
        } catch {
          throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `LLM batch item ${index + 1} returned invalid JSON.` });
        }
        if (String(providerJson?.choices?.[0]?.finish_reason || '').toLowerCase() === 'length') {
          throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `LLM batch item ${index + 1} was truncated.` });
        }
        const content = providerJson?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
          throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `LLM batch item ${index + 1} returned no content.` });
        }
        const clean = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        try {
          return JSON.parse(clean);
        } catch {
          throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `LLM batch item ${index + 1} content is not valid JSON.` });
        }
      });
      if (batchMode === 'acts') {
        const combined = mergeActBatch(parsedResponses);
        reply.status(200).header('content-type', 'application/json; charset=utf-8');
        reply.send(JSON.stringify({ choices: [{ message: { content: JSON.stringify(combined) } }], batch: { count: combined.acts.length } }));
        return;
      }
      const base = parsedResponses[0] && typeof parsedResponses[0] === 'object' ? { ...parsedResponses[0] } : {};
      const mergedScenes = parsedResponses.flatMap((item) => Array.isArray(item?.scenes) ? item.scenes : []);
      if (mergedScenes.length === 0) {
        throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'LLM batch returned no scenes.' });
      }
      mergedScenes.forEach((scene: any, index: number) => {
        if (scene && typeof scene === 'object') scene.scene_order = index + 1;
      });
      base.scenes = mergedScenes;
      base.batch_count = parsedResponses.length;
      reply.status(200).header('content-type', 'application/json; charset=utf-8');
      reply.send(JSON.stringify({ choices: [{ message: { content: JSON.stringify(base) } }], batch: { count: parsedResponses.length } }));
      return;
    }

    const providerName = String(body.provider || '').toLowerCase();
    const providerRequest = buildProviderRequest({
      provider: providerName,
      path: body.path,
      body: body.body,
      apiKey: apiKeyFor(providerName),
    });
    const response = await fetch(providerRequest.url, {
      method: 'POST',
      headers: providerRequest.headers,
      body: JSON.stringify(body.body),
    });
    await proxyJson(reply, response);
  });
}
