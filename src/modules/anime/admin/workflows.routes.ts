import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { ANIME_WORKFLOW_REGISTRY, findAnimeWorkflow } from './workflowRegistry';

const WorkflowKeyBody = Type.Object({ workflow_key: Type.String({ minLength: 5, maxLength: 8 }) });

function n8nConfig(): { baseUrl: string; apiKey: string } {
  const apiKey = (process.env.ANIME_N8N_API_KEY || process.env.WF09_N8N_API_KEY || '').trim();
  if (!apiKey) {
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'N8N_API_KEY_NOT_CONFIGURED' });
  }
  return { baseUrl: `${(process.env.N8N_BASE_URL || 'http://n8n:5678').replace(/\/+$/, '')}/api/v1/workflows`, apiKey };
}

async function loadCanonicalWorkflow(key: string): Promise<{ entry: any; workflow: any }> {
  const entry = findAnimeWorkflow(key);
  if (!entry) {
    throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Workflow is not in the Anime canonical registry.' });
  }
  const candidates = [
    path.resolve(process.cwd(), 'n8n-workflows', entry.file),
    path.resolve(__dirname, '..', '..', '..', '..', 'n8n-workflows', entry.file),
  ];
  let raw: string | undefined;
  for (const candidate of candidates) {
    try {
      raw = await readFile(candidate, 'utf8');
      break;
    } catch (_err) {}
  }
  if (!raw) {
    throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Canonical workflow file is unavailable.' });
  }
  const workflow = JSON.parse(raw);
  if (workflow.id !== entry.id || workflow.name !== entry.name) {
    throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Canonical workflow identity does not match the registry.' });
  }
  if (workflow.active === true) {
    throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'Canonical workflow must be committed inactive.' });
  }
  return { entry, workflow };
}

async function n8nRequest(config: { baseUrl: string; apiKey: string }, pathSuffix: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${config.baseUrl}${pathSuffix}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': config.apiKey,
      ...(init.headers || {}),
    },
  });
}

function deployPayload(workflow: any): Record<string, unknown> {
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings || {},
  };
}

export async function registerAnimeAdminWorkflowRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/admin/workflows/registry', { preHandler: [app.authenticate, app.requireOwner] }, async () => ({
    data: ANIME_WORKFLOW_REGISTRY.map((entry) => ({ ...entry })),
  }));

  app.post('/v1/anime/admin/workflows/deploy', { schema: { body: WorkflowKeyBody }, preHandler: [app.authenticate, app.requireOwner] }, async (request: any, reply: any) => {
    const config = n8nConfig();
    const { entry, workflow } = await loadCanonicalWorkflow(request.body.workflow_key);
    const payload = deployPayload(workflow);
    const update = await n8nRequest(config, `/${entry.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (update.ok) {
      return { status: 'completed', workflow_key: entry.key, n8n_workflow_id: entry.id, action: 'updated', active: false };
    }
    if (update.status !== 404) {
      const details = await update.text();
      return reply.code(502).send({ status: 'failed', error: 'N8N_DEPLOY_REJECTED', details });
    }
    const create = await n8nRequest(config, '', { method: 'POST', body: JSON.stringify({ ...payload, id: entry.id }) });
    const created: any = await create.json().catch(() => ({}));
    if (!create.ok) {
      return reply.code(502).send({ status: 'failed', error: 'N8N_DEPLOY_REJECTED', details: created });
    }
    if (created.id !== entry.id) {
      if (created.id) {
        await n8nRequest(config, `/${created.id}`, { method: 'DELETE' }).catch(() => undefined);
      }
      return reply.code(502).send({ status: 'failed', error: 'N8N_CANONICAL_ID_MISMATCH' });
    }
    return { status: 'completed', workflow_key: entry.key, n8n_workflow_id: entry.id, action: 'created', active: false };
  });

  app.post('/v1/anime/admin/workflows/activate', { schema: { body: WorkflowKeyBody }, preHandler: [app.authenticate, app.requireOwner] }, async (request: any, reply: any) => {
    const config = n8nConfig();
    const entry = findAnimeWorkflow(request.body.workflow_key);
    if (!entry) {
      throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Workflow is not in the Anime canonical registry.' });
    }
    const response = await n8nRequest(config, `/${entry.id}/activate`, { method: 'POST' });
    if (!response.ok) {
      const details = await response.text();
      return reply.code(502).send({ status: 'failed', error: 'N8N_ACTIVATE_REJECTED', details });
    }
    return { status: 'completed', workflow_key: entry.key, n8n_workflow_id: entry.id, active: true };
  });

  app.post('/v1/anime/admin/workflows/deactivate', { schema: { body: WorkflowKeyBody }, preHandler: [app.authenticate, app.requireOwner] }, async (request: any, reply: any) => {
    const config = n8nConfig();
    const entry = findAnimeWorkflow(request.body.workflow_key);
    if (!entry) {
      throw new AnimeError({ code: AnimeErrorCode.NOT_FOUND, message: 'Workflow is not in the Anime canonical registry.' });
    }
    const response = await n8nRequest(config, `/${entry.id}/deactivate`, { method: 'POST' });
    if (!response.ok) {
      const details = await response.text();
      return reply.code(502).send({ status: 'failed', error: 'N8N_DEACTIVATE_REJECTED', details });
    }
    return { status: 'completed', workflow_key: entry.key, n8n_workflow_id: entry.id, active: false };
  });
}
