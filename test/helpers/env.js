'use strict';

const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'stage3_test_jwt_secret_not_for_production';
process.env.JWT_ISSUER = 'stage4-test-issuer';
process.env.JWT_AUDIENCE = 'stage4-test-audience';
process.env.TELEGRAM_BOT_TOKEN = '123456789:stage4-test-telegram-token';
process.env.SUPABASE_URL = 'https://test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stage3-test-service-role-key';
process.env.ANIME_SUPABASE_URL = 'https://test.supabase.invalid';
process.env.ANIME_SUPABASE_SERVICE_ROLE_KEY = 'stage3-test-anime-service-key';
process.env.ANIME_SUPABASE_ANON_KEY = 'stage3-test-anime-anon-key';
process.env.ANIME_N8N_CALLBACK_SECRET = 'stage3-test-n8n-callback-secret';
process.env.ANIME_WORKER_CALLBACK_SECRET = 'stage3-test-worker-callback-secret';
process.env.ANIME_PROCESS_ROLE = 'api';
process.env.N8N_BASE_URL = 'http://127.0.0.1:9';
process.env.N8N_WEBHOOK_SECRET = 'stage3-test-n8n-webhook-secret';
process.env.TRUSTED_SERVICE_TOKEN = 'stage3-test-service-token';
process.env.OWNER_EMAILS = 'owner@test.invalid';
process.env.PORT = '0';

const backendRoot = path.resolve(__dirname, '..', '..');
const distRoot = path.join(backendRoot, 'dist');
const repoRoot = path.resolve(backendRoot, '..');

function dist(relativePath) {
  return require(path.join(distRoot, relativePath));
}

module.exports = { backendRoot, distRoot, repoRoot, dist };
