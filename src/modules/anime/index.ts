import type { FastifyInstance } from 'fastify';
import { registerAnimeAdminLedgerRoutes } from './admin/ledger.routes';
import { registerAnimeAdminSystemRoutes } from './admin/system.routes';
import { registerAnimeAdminWorkersRoutes } from './admin/workers.routes';
import { registerAnimeApprovalsRoutes } from './approvals/approvals.routes';
import { registerAnimeCallbacksRoutes } from './callbacks/callbacks.routes';
import { registerAnimeCommandsRoutes } from './commands/commands.routes';
import { animeErrorHandler } from './errors/anime.errors';
import { startBrainWorker } from './intelligence/brain.worker';
import { startIncidentWorker } from './intelligence/incident.worker';
import { registerAnimeMediaRoutes } from './media/media.routes';
import { animeRequestIdHook } from './middleware/request-id';
import { registerAnimeInfrastructureRoutes } from './infrastructure/infrastructure.routes';
import { startRole } from './process-role';
import { registerAnimeAnalyticsRoutes } from './reads/analytics.routes';
import { registerAnimeCreativeRoutes } from './reads/creative.routes';
import { registerAnimeReadsRoutes } from './reads/reads.routes';
import { registerAnimeHealthRoutes } from './routes/health.routes';
import { registerAnimeDevicesRoutes } from './system/devices.routes';

export async function registerAnimeModule(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', animeRequestIdHook);

  // --- NEW AUTH HOOK (Anime Engine Only) ---
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url || '';
    if (url.startsWith('/v1/anime/health')) return;
    if (url.startsWith('/v1/anime/callbacks')) return;

    const authFn = (app as any).authenticate;
    if (typeof authFn !== 'function') {
      throw new Error('anime/auth: fastify.authenticate decorator missing');
    }
    await authFn(request, reply);
  });
  // --- END NEW AUTH HOOK ---
  app.setErrorHandler(animeErrorHandler);
  await app.register(registerAnimeHealthRoutes);
  await app.register(registerAnimeDevicesRoutes);
  await app.register(registerAnimeInfrastructureRoutes);
  await app.register(registerAnimeCommandsRoutes);
  await app.register(registerAnimeCallbacksRoutes);
  await app.register(registerAnimeReadsRoutes);
  await app.register(registerAnimeCreativeRoutes);
  await app.register(registerAnimeMediaRoutes);
  await app.register(registerAnimeAnalyticsRoutes);
  await app.register(registerAnimeApprovalsRoutes);
  await app.register(registerAnimeAdminWorkersRoutes);
  await app.register(registerAnimeAdminLedgerRoutes);
  await app.register(registerAnimeAdminSystemRoutes);
  startBrainWorker();
  startIncidentWorker();
  startRole();
}
