import systemRoutes from './modules/system/system.routes.js';
import incidentsRoutes from './modules/incidents/incidents.routes.js';
import { startHealthCheckJob } from './jobs/healthCheck.job.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env';
import supabasePlugin from './plugins/supabase';
import authPlugin from './plugins/auth';
import authRoutes from './modules/auth/auth.routes';
import aiRoutes from './modules/ai/ai.routes';
import n8nRoutes from './modules/n8n/n8n.routes';
import memoryRoutes from './modules/memory/memory.routes';
import tasksRoutes from './modules/tasks/tasks.routes';
import ownerRoutes from './modules/owner/owner.routes';
import userRoutes from './modules/user/user.routes';
import skillsRoutes from './modules/skills/skills.routes';
import configRoutes from './modules/config/config.routes';
// --- v3.1 NEW IMPORTS ---
import capabilitiesRoutes from './modules/capabilities/capabilities.routes';
import skillsV31Routes from './modules/skills/skills.v31.routes';
import copilotRoutes from './modules/copilot/copilot.routes';
import approvalsRoutes from './modules/approvals/approvals.routes';
import trustedControllerRoutes from './modules/trusted-controller/trustedController.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import filesRoutes from './modules/files/files.routes';
import cinematicRoutes from './modules/cinematic/cinematic.routes';
import telegramProxyRoutes from './modules/anime/media/telegram.proxy';

const server = Fastify({ logger: { level: env.NODE_ENV === 'production' ? 'info' : 'debug' }, bodyLimit: 5 * 1024 * 1024 });

async function bootstrap() {
  await server.register(helmet, { contentSecurityPolicy: false });
  const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  await server.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Service-Token', 'X-Client-Version', 'Accept', 'Idempotency-Key', 'X-Request-Id']
  });
  await server.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await server.register(supabasePlugin);
  await server.register(authPlugin);

  server.get('/health', async () => ({ status: 'ok', version: '3.1.0', timestamp: new Date().toISOString() }));

  // --- EXISTING v3.0 ROUTES ---
  await server.register(authRoutes, { prefix: '/api/v1/auth' });
  await server.register(aiRoutes, { prefix: '/api/v1/ai' });
  await server.register(n8nRoutes, { prefix: '/api/v1/n8n' });
  await server.register(memoryRoutes, { prefix: '/api/v1/memory' });
  await server.register(tasksRoutes, { prefix: '/api/v1/tasks' });
  await server.register(ownerRoutes, { prefix: '/api/v1/owner' });
  await server.register(userRoutes, { prefix: '/api/v1/user' });
  await server.register(skillsRoutes, { prefix: '/api/v1/skills' });
  await server.register(configRoutes, { prefix: '/api/v1/config' });

  // --- v3.1 NEW ROUTES ---
  await server.register(capabilitiesRoutes, { prefix: '/api/v1/capabilities' });
  await server.register(skillsV31Routes, { prefix: '/api/v1/skills' });
  await server.register(copilotRoutes, { prefix: '/api/v1/copilot' });
  await server.register(approvalsRoutes, { prefix: '/api/v1/approvals' });
  await server.register(trustedControllerRoutes, { prefix: '/api/v1/trusted-controller' });
  await server.register(notificationsRoutes, { prefix: '/api/v1/notifications' });
  await server.register(filesRoutes, { prefix: '/api/v1/files' });
  await server.register(cinematicRoutes, { prefix: '/api/v1/cinematic' });

  // --- TELEGRAM PERMANENT MEDIA STREAM PROXY ---
  await server.register(telegramProxyRoutes);

  // --- EXISTING WORKERS & MODULES ---
  const taskWorker = (await import('./modules/tasks/task.worker')).default;
  await server.register(taskWorker);
  await server.register(systemRoutes, { prefix: '/api/system' });
  await server.register(incidentsRoutes, { prefix: '/api/incidents' });
  startHealthCheckJob(server);

  // --- EXISTING ANIME MODULE ---
  await server.register((await import('./modules/anime')).registerAnimeModule);

  await server.listen({ port: env.PORT, host: '0.0.0.0' });
  server.log.info(`BNAI Backend v3.1 listening on port ${env.PORT}`);
}

bootstrap().catch((err) => { server.log.error(err, 'Fatal startup'); process.exit(1); });
