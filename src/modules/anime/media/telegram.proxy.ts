import type { FastifyInstance, FastifyReply } from 'fastify';
import { resolveTelegramFileAccess, userOwnsAnyProject } from './telegram.media.repo';
import {
  buildTelegramDownloadUrl,
  buildTelegramGetFileUrl,
  invalidRequest,
  safeMediaContentType,
  TelegramProxyError,
  validateTelegramBotToken,
  validateTelegramFileId
} from './telegram.security';

const UPSTREAM_TIMEOUT_MS = 15000;

function sendProxyError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof TelegramProxyError) {
    return reply.status(error.statusCode).send({ ok: false, error: error.message });
  }
  return reply.status(500).send({ ok: false, error: 'Telegram media proxy failed' });
}

async function fetchWithoutRedirect(url: URL): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { method: 'GET', redirect: 'error', signal: controller.signal });
  } catch (_error) {
    throw new TelegramProxyError(502, 'TELEGRAM_UPSTREAM_FAILED', 'Telegram media request failed');
  } finally {
    clearTimeout(timer);
  }
}

export default async function telegramProxyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/media/telegram/:file_id',
    { preHandler: [app.authenticateOptional], logLevel: 'warn' },
    async (request, reply) => {
      try {
        const query = (request.query ?? {}) as Record<string, unknown>;
        if (Object.prototype.hasOwnProperty.call(query, 'bot_token')) {
          throw invalidRequest('bot_token is not accepted');
        }

        const fileId = validateTelegramFileId((request.params as { file_id?: string }).file_id);
        const auth = request.authContext;
        const access = await resolveTelegramFileAccess(fileId, Boolean(auth));

        if (!access.published) {
          if (!auth) {
            return reply.status(401).send({ ok: false, error: 'Authentication required' });
          }
          if (access.projectIds.length === 0) {
            return reply.status(404).send({ ok: false, error: 'Media asset not found' });
          }
          const ownsProject = await userOwnsAnyProject(auth.userId, access.projectIds);
          if (!ownsProject) {
            return reply.status(403).send({ ok: false, error: 'Media access denied' });
          }
        }

        const botToken = validateTelegramBotToken(process.env.TELEGRAM_BOT_TOKEN);
        const getFileUrl = buildTelegramGetFileUrl(botToken, fileId);
        const metaResponse = await fetchWithoutRedirect(getFileUrl);
        if (!metaResponse.ok) {
          throw new TelegramProxyError(502, 'TELEGRAM_UPSTREAM_FAILED', 'Telegram media request failed');
        }

        let metadata: { ok?: boolean; result?: { file_path?: string; file_size?: number } };
        try {
          metadata = await metaResponse.json() as typeof metadata;
        } catch (_error) {
          throw new TelegramProxyError(502, 'TELEGRAM_UPSTREAM_FAILED', 'Telegram media request failed');
        }

        const filePath = typeof metadata.result?.file_path === 'string' ? metadata.result.file_path : '';
        if (metadata.ok !== true || !filePath) {
          return reply.status(404).send({ ok: false, error: 'Media asset not found' });
        }

        const downloadUrl = buildTelegramDownloadUrl(botToken, filePath);
        const mediaResponse = await fetchWithoutRedirect(downloadUrl);
        if (!mediaResponse.ok || !mediaResponse.body) {
          throw new TelegramProxyError(502, 'TELEGRAM_UPSTREAM_FAILED', 'Telegram media request failed');
        }

        const buffer = Buffer.from(await mediaResponse.arrayBuffer());
        reply.header('Content-Type', safeMediaContentType(filePath, mediaResponse.headers.get('content-type')));
        reply.header('Content-Length', String(buffer.byteLength));
        reply.header('Cache-Control', 'private, no-store');
        reply.header('X-Content-Type-Options', 'nosniff');
        return reply.status(200).send(buffer);
      } catch (error) {
        return sendProxyError(reply, error);
      }
    }
  );
}
