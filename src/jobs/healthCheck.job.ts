import type { FastifyInstance } from 'fastify';
import { checkHealth } from '../modules/system/system.service.js';

let lastAlertTime = 0;
const DEDUP_WINDOW_MS = 15 * 60 * 1000;

export function startHealthCheckJob(fastify: FastifyInstance) {
  fastify.log.info('Starting Health Check Cron Job (5 min interval)');

  setInterval(async () => {
    try {
      const health = await checkHealth(fastify);
      if (health.status === 'healthy') return;

      const now = Date.now();
      if (now - lastAlertTime < DEDUP_WINDOW_MS) {
         fastify.log.warn('Health degraded but alert deduplicated');
         return;
      }

      lastAlertTime = now;

      const wf10Url = process.env.N8N_WF10_URL;
      if (!wf10Url) {
        fastify.log.error('N8N_WF10_URL not set, cannot send alert');
        return;
      }

      const payload = {
        request_id: 'health-' + now,
        payload: {
          severity: health.status === 'unhealthy' ? 'critical' : 'warning',
          category: 'system_health',
          title: 'System Health: ' + health.status.toUpperCase(),
          body: 'Health check failed: ' + JSON.stringify(health.checks),
          channels: ['telegram'],
          deduplication_key: 'system-health-alert'
        }
      };

      await fetch(wf10Url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      fastify.log.info('Health alert sent to WF-10');
    } catch (err: any) {
      fastify.log.error('Health check job failed: ' + err.message);
    }
  }, 5 * 60 * 1000);
}
