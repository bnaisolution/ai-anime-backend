import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { animeSupabase } from '../db/anime.supabase';

export default async function telegramProxyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/media/telegram/:file_id',
    async (
      request: FastifyRequest<{ Params: { file_id: string }; Querystring: { bot_token?: string } }>,
      reply: FastifyReply
    ) => {
      const fileId = request.params.file_id?.trim();
      if (!fileId) {
        return reply.status(400).send({ ok: false, error: 'Missing Telegram file_id' });
      }

      let botToken = request.query.bot_token || process.env.TELEGRAM_BOT_TOKEN || '';

      if (!botToken) {
        const { data: infraRow } = await animeSupabase
          .from('user_infrastructure')
          .select('config')
          .in('provider_type', ['custom', 'kaggle', 'own_gpu'])
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ config: Record<string, any> }>();

        botToken =
          infraRow?.config?.telegram_storage?.bot_token ||
          infraRow?.config?.bot_token ||
          '';
      }

      if (!botToken) {
        return reply.status(500).send({
          ok: false,
          error: 'TELEGRAM_BOT_TOKEN is not configured in environment or user_infrastructure.',
        });
      }

      const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`;
      const metaRes = await fetch(getFileUrl);
      const metaJson = (await metaRes.json()) as {
        ok: boolean;
        result?: { file_path?: string; file_size?: number };
        description?: string;
      };

      if (!metaJson.ok || !metaJson.result?.file_path) {
        return reply.status(404).send({
          ok: false,
          error: metaJson.description || 'Unable to resolve file_path from Telegram.',
        });
      }

      const fileDownloadUrl = `https://api.telegram.org/file/bot${botToken}/${metaJson.result.file_path}`;
      const streamRes = await fetch(fileDownloadUrl);

      if (!streamRes.ok || !streamRes.body) {
        return reply.status(502).send({
          ok: false,
          error: 'Failed to stream binary asset from Telegram CDN.',
        });
      }

      const ext = metaJson.result.file_path.split('.').pop()?.toLowerCase() || '';
      const contentType =
        ext === 'mp4'
          ? 'video/mp4'
          : ext === 'wav'
            ? 'audio/wav'
            : ext === 'mp3'
              ? 'audio/mpeg'
              : ext === 'png'
                ? 'image/png'
                : ext === 'jpg' || ext === 'jpeg'
                  ? 'image/jpeg'
                  : streamRes.headers.get('content-type') || 'application/octet-stream';

      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      if (metaJson.result.file_size) {
        reply.header('Content-Length', String(metaJson.result.file_size));
      }

      const arrayBuffer = await streamRes.arrayBuffer();
      return reply.send(Buffer.from(arrayBuffer));
    }
  );
}
