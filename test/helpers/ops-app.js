'use strict';

const H = require('./env');
const { installFakeSupabase } = require('./fake-supabase');

function requireDefault(relativePath) {
  const mod = H.dist(relativePath);
  return mod && mod.default ? mod.default : mod;
}

async function buildOpsApp(supabaseHandler) {
  const fake = installFakeSupabase(supabaseHandler);
  const Fastify = require('fastify');
  const app = Fastify({ logger: false });
  app.decorate('supabase', fake.client);
  await app.register(requireDefault('plugins/auth.js'));
  await app.register(requireDefault('modules/system/system.routes.js'), { prefix: '/api/system' });
  await app.register(requireDefault('modules/incidents/incidents.routes.js'), { prefix: '/api/incidents' });
  await app.ready();
  return { app, fake };
}

function sign(app, overrides = {}) {
  return app.jwt.sign({
    sub: 'user-a',
    workspace_id: 'ws-1',
    email: 'user-a@test.invalid',
    role: 'normal_user',
    ...overrides,
  });
}

module.exports = { buildOpsApp, sign };
