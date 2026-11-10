'use strict';

const H = require('./env');
const { installFakeSupabase } = require('./fake-supabase');

function requireDefault(relativePath) {
  const mod = H.dist(relativePath);
  return mod && mod.default ? mod.default : mod;
}

async function buildApp(options = {}) {
  const handler = options.supabaseHandler;
  const fake = installFakeSupabase(handler, options.rpcHandler);

  const Fastify = require('fastify');
  const app = Fastify({ logger: false });
  app.decorate('supabase', fake.client);

  const authPlugin = requireDefault('plugins/auth.js');
  await app.register(authPlugin);
  await app.register(requireDefault('modules/auth/auth.routes.js'), { prefix: '/api/v1/auth' });
  await app.register(requireDefault('modules/config/config.routes.js'), { prefix: '/api/v1/config' });
  await app.register(requireDefault('modules/memory/memory.routes.js'), { prefix: '/api/v1/memory' });
  await app.register(requireDefault('modules/anime/media/telegram.proxy.js'));

  const { animeRequestIdHook } = H.dist('modules/anime/middleware/request-id.js');
  const { animeErrorHandler } = H.dist('modules/anime/errors/anime.errors.js');
  app.addHook('onRequest', animeRequestIdHook);
  app.setErrorHandler(animeErrorHandler);

  const { registerAnimeRoutes } = H.dist('modules/anime/index.js');
  await registerAnimeRoutes(app);

  await app.ready();
  return { app, fake };
}

function signFor(app, userId, extra = {}) {
  return app.jwt.sign({ sub: userId, email: 'user@test.invalid', role: 'normal_user', ...extra });
}

module.exports = { buildApp, signFor };
