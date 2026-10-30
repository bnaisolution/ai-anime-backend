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
import { outboxDispatcher } from './outbox/outbox.dispatcher';
import { registerAnimeAnalyticsRoutes } from './reads/analytics.routes';
import { registerAnimeCreativeRoutes } from './reads/creative.routes';
import { registerAnimeReadsRoutes } from './reads/reads.routes';
import { registerAnimeHealthRoutes } from './routes/health.routes';
import { supervisorWorker } from './supervisor/supervisor.worker';
import { registerAnimeDevicesRoutes } from './system/devices.routes';

export async function registerAnimeModule(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', animeRequestIdHook);
  app.setErrorHandler(animeErrorHandler);
  await app.register(registerAnimeHealthRoutes);
  await app.register(registerAnimeDevicesRoutes);
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
  try {
    const infraRoutesMod: any = await import('./infrastructure/infrastructure.routes');
    const regFn = infraRoutesMod.registerAnimeInfrastructureRoutes || infraRoutesMod.registerInfrastructureRoutes || infraRoutesMod.default;
    if (typeof regFn === 'function') await app.register(regFn);
  } catch (_e) {}
  outboxDispatcher.start(2000);
  supervisorWorker.start(3000, 60000);
  startBrainWorker();
  startIncidentWorker();
}
