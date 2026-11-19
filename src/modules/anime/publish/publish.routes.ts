import type { FastifyInstance, FastifyReply } from 'fastify';
import { flags } from '../../../config/flags';
import { incrementCounter } from '../observability/metrics';
import {
  completeOAuth,
  disconnectChannel,
  listChannels,
  platformConfig,
  refreshChannelTokens,
  startOAuth,
  testChannel,
} from './publish.service';

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ status: 'failed', errors: [{ category: code, message }] });
}

function htmlPage(title: string, message: string): string {
  const safeTitle = title.replace(/[<>&]/g, '');
  const safeMessage = message.replace(/[<>&]/g, '');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head>
<body style="font-family:system-ui;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center;padding:24px"><h2>${safeTitle}</h2><p>${safeMessage}</p><p style="opacity:.6;font-size:13px">You can close this tab and return to the app.</p></div>
</body></html>`;
}

export async function registerAnimePublishRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/anime/publish/channels', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.authContext.userId;
    const channels = await listChannels(userId);
    return reply.send({
      data: {
        channels,
        configured: {
          youtube: Boolean(platformConfig('youtube')?.configured),
          instagram: Boolean(platformConfig('instagram')?.configured),
        },
      },
    });
  });

  app.post('/v1/anime/publish/oauth/:platform/start', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!flags.publishOauthV2) {
      return fail(reply, 503, 'OAUTH_DISABLED', 'Publishing OAuth is disabled on this deployment.');
    }
    const params = (request.params as Record<string, unknown>) || {};
    const body = (request.body as Record<string, unknown>) || {};
    const platform = String(params.platform || '').toLowerCase();
    if (!platformConfig(platform)) {
      return fail(reply, 400, 'PLATFORM_INVALID', 'Unsupported publishing platform.');
    }
    const projectId = typeof body.project_id === 'string' ? body.project_id : null;
    try {
      const result = await startOAuth(request.authContext.userId, platform, projectId);
      incrementCounter('anime_publish_oauth_starts_total', { platform, configured: String(result.configured) });
      if (!result.configured) {
        return fail(reply, 503, 'OAUTH_NOT_CONFIGURED', 'This platform is not configured on the server yet.');
      }
      return reply.send({ data: result });
    } catch (error) {
      const code = String((error as { code?: string })?.code || 'OAUTH_START_FAILED');
      return fail(reply, 502, code, error instanceof Error ? error.message : 'OAuth start failed.');
    }
  });

  app.get('/v1/anime/publish/oauth/:platform/callback', async (request, reply) => {
    const params = (request.params as Record<string, unknown>) || {};
    const query = (request.query as Record<string, unknown>) || {};
    const platform = String(params.platform || '').toLowerCase();
    const code = typeof query.code === 'string' ? query.code : '';
    const state = typeof query.state === 'string' ? query.state : '';
    if (!code || !state) {
      return reply.code(400).type('text/html').send(htmlPage('Connection failed', 'Missing OAuth code or state.'));
    }
    try {
      const result = await completeOAuth({ platform, code, state });
      incrementCounter('anime_publish_oauth_callbacks_total', { platform, status: 'success' });
      return reply.type('text/html').send(
        htmlPage('Channel connected', `${result.channel.channel_name || result.platform} is now connected.`)
      );
    } catch (error) {
      incrementCounter('anime_publish_oauth_callbacks_total', { platform, status: 'failed' });
      const message = error instanceof Error ? error.message : 'OAuth callback failed.';
      return reply.code(400).type('text/html').send(htmlPage('Connection failed', message));
    }
  });

  app.post('/v1/anime/publish/channels/:id/test', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = (request.params as Record<string, unknown>) || {};
    const channelId = String(params.id || '');
    const result = await testChannel(request.authContext.userId, channelId);
    incrementCounter('anime_publish_channel_tests_total', { ok: String(result.ok) });
    if (!result.channel) return fail(reply, 404, 'CHANNEL_NOT_FOUND', 'Publishing channel not found.');
    return reply.send({ data: result });
  });

  app.post('/v1/anime/publish/channels/:id/refresh', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = (request.params as Record<string, unknown>) || {};
    const channelId = String(params.id || '');
    try {
      const channel = await refreshChannelTokens(request.authContext.userId, channelId, { force: true });
      return reply.send({ data: { ok: true, channel } });
    } catch (error) {
      const code = String((error as { code?: string })?.code || 'CHANNEL_REFRESH_FAILED');
      const status = code === 'CHANNEL_NOT_FOUND' ? 404 : code === 'CHANNEL_EXPIRED' ? 409 : 502;
      return fail(reply, status, code, error instanceof Error ? error.message : 'Channel refresh failed.');
    }
  });

  app.post('/v1/anime/publish/channels/:id/disconnect', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = (request.params as Record<string, unknown>) || {};
    const channelId = String(params.id || '');
    const ok = await disconnectChannel(request.authContext.userId, channelId);
    if (!ok) return fail(reply, 404, 'CHANNEL_NOT_FOUND', 'Publishing channel not found.');
    return reply.send({ data: { disconnected: true } });
  });
}
