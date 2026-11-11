import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { animeEnv } from '../config/anime.env';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { handleCallbackRequest } from '../callbacks/callbacks.handler';
import { signCallbackPayload } from '../callbacks/signature';
import { verifyWorkflowGatewayRequest } from './workflowGateway.auth';
import { resolveCommandBinding } from './workflowGateway.routes';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(message: string): never {
  throw new AnimeError({ code: AnimeErrorCode.AUTH_INVALID, message });
}

export async function registerAnimeWorkflowCallbackRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/anime/internal/workflow/callback', async (request: any) => {
    const body = request.body as any;
    if (!body || typeof body !== 'object') invalid('Callback body is required.');
    const system = body.system_scope === true;
    verifyWorkflowGatewayRequest(request, system);

    let projectId: string;
    let commandId: string | undefined;
    if (system) {
      projectId = String(body.project_id || '').trim();
      if (!UUID_RE.test(projectId)) invalid('project_id is required for system callbacks.');
      const rawCommand = String(body.command_id || '').trim().replace(/^cmd_/, '');
      if (rawCommand) {
        if (!UUID_RE.test(rawCommand)) invalid('Invalid command_id.');
        commandId = rawCommand;
      }
    } else {
      const binding = await resolveCommandBinding(body);
      projectId = binding.project_id;
      commandId = binding.command_id;
    }

    const callbackId = String(body.callback_id || `${body.execution_id || randomUUID()}:callback`);
    const payload: Record<string, unknown> = {
      project_id: projectId,
      command_id: commandId ?? null,
      wf_key: body.wf_key,
      status: body.status,
      execution_id: body.execution_id,
      callback_id: callbackId,
      result: body.result,
      error: body.error,
    };
    const rawBody = JSON.stringify(payload);
    const timestampSec = String(Math.floor(Date.now() / 1000));
    const signature = signCallbackPayload(timestampSec, rawBody, animeEnv.ANIME_N8N_CALLBACK_SECRET);
    const result = await handleCallbackRequest({
      source: 'n8n',
      rawBody,
      signatureHeader: signature,
      timestampHeader: timestampSec,
      nonceHeader: randomUUID(),
      requestId: request?.anime?.request_id ?? randomUUID(),
    });
    return { data: result };
  });
}
