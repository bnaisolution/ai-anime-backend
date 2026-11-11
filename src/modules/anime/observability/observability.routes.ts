import type { FastifyInstance } from 'fastify';
import { animeSupabase } from '../db/anime.supabase';
import { incrementCounter, observeHistogram, renderPrometheusMetrics, setGauge } from './metrics';

function metricsEnabled(): boolean {
  return process.env.ANIME_METRICS_ENABLED === 'true';
}

function metricsToken(): string {
  return String(process.env.ANIME_METRICS_TOKEN || '').trim();
}

function authorized(request: any): boolean {
  const token = metricsToken();
  if (!token) return true;
  const header = String(request.headers['x-anime-metrics-token'] || '');
  const bearer = String(request.headers.authorization || '');
  return header === token || bearer === `Bearer ${token}`;
}

export async function registerAnimeObservabilityRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onResponse', async (request, reply) => {
    const route = String((request as any).routeOptions?.url || request.url || 'unknown').split('?')[0];
    incrementCounter('anime_http_requests_total', { method: request.method, route, status: reply.statusCode });
    observeHistogram('anime_http_request_duration_seconds', reply.elapsedTime / 1000, { method: request.method, route });
  });

  app.get('/v1/anime/live', async () => ({ ok: true, status: 'live' }));

  app.get('/v1/anime/ready', async (_request, reply) => {
    const started = Date.now();
    const { error } = await animeSupabase.from('projects').select('id').limit(1);
    setGauge('anime_dependency_up', error ? 0 : 1, { dependency: 'database' });
    setGauge('anime_readiness_check_duration_seconds', (Date.now() - started) / 1000);
    if (error) {
      void reply.status(503);
      return { ok: false, status: 'not_ready', dependencies: { database: 'down' } };
    }
    return { ok: true, status: 'ready', dependencies: { database: 'up' } };
  });

  app.get('/v1/anime/metrics', async (request, reply) => {
    if (!metricsEnabled()) {
      void reply.status(404);
      return { error: 'metrics_disabled' };
    }
    if (!metricsToken()) {
      void reply.status(503);
      return { error: 'metrics_token_not_configured' };
    }
    if (!authorized(request)) {
      void reply.status(401);
      return { error: 'metrics_unauthorized' };
    }
    setGauge('anime_process_uptime_seconds', process.uptime());
    setGauge('anime_process_memory_bytes', process.memoryUsage().rss, { kind: 'rss' });
    void reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return renderPrometheusMetrics();
  });
}
