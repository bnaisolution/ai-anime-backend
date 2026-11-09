import dotenv from 'dotenv';
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'production';

function required(name: string): string {
  const value = (process.env[name] || '').trim();
  if (!value) throw new Error(`[Auth] ${name} must be configured`);
  return value;
}

const JWT_SECRET = required('JWT_SECRET');
if (NODE_ENV === 'production' && JWT_SECRET.length < 32) {
  throw new Error('[Auth] JWT_SECRET must be at least 32 characters in production');
}

export interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  SUPABASE_JWKS_URL: string;
  SUPABASE_JWT_ISSUER: string;
  SUPABASE_JWT_AUDIENCE: string;
  JWT_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  JWT_EXPIRES_IN: string;
  AUTH_INTERNAL_JWT_ENABLED: boolean;
  OWNER_EMAILS: string[];
  TRUSTED_SERVICE_TOKEN: string;
  GROQ_API_KEY: string;
  GROQ_MODEL: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  N8N_BASE_URL: string;
  N8N_WEBHOOK_SECRET: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_OWNER_CHAT_ID: string;
  LOW_TPM_MODE: boolean;
  AI_TPM_BUDGET: number;
  AI_MAX_RETRIES: number;
  AI_REQUEST_TIMEOUT_MS: number;
}

const SUPABASE_URL = required('SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_AUTH_ISSUER = `${SUPABASE_URL}/auth/v1`;
const AUTH_INTERNAL_JWT_ENABLED = (process.env.AUTH_INTERNAL_JWT_ENABLED || (NODE_ENV === 'test' ? 'true' : 'false')).trim().toLowerCase() === 'true';

export const env: EnvConfig = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV,
  SUPABASE_URL,
  SUPABASE_ANON_KEY: (process.env.SUPABASE_ANON_KEY || '').trim(),
  SUPABASE_SERVICE_ROLE_KEY: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  SUPABASE_JWT_SECRET: (process.env.SUPABASE_JWT_SECRET || '').trim(),
  SUPABASE_JWKS_URL: (process.env.SUPABASE_JWKS_URL || `${SUPABASE_AUTH_ISSUER}/.well-known/jwks.json`).trim(),
  SUPABASE_JWT_ISSUER: (process.env.SUPABASE_JWT_ISSUER || SUPABASE_AUTH_ISSUER).trim(),
  SUPABASE_JWT_AUDIENCE: (process.env.SUPABASE_JWT_AUDIENCE || 'authenticated').trim(),
  JWT_SECRET,
  JWT_ISSUER: required('JWT_ISSUER'),
  JWT_AUDIENCE: required('JWT_AUDIENCE'),
  JWT_EXPIRES_IN: (process.env.JWT_EXPIRES_IN || '1h').trim(),
  AUTH_INTERNAL_JWT_ENABLED,
  OWNER_EMAILS: (process.env.OWNER_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  TRUSTED_SERVICE_TOKEN: (process.env.TRUSTED_SERVICE_TOKEN || '').trim(),
  GROQ_API_KEY: (process.env.GROQ_API_KEY || '').trim(),
  GROQ_MODEL: (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim(),
  GEMINI_API_KEY: (process.env.GEMINI_API_KEY || '').trim(),
  GEMINI_MODEL: (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim(),
  N8N_BASE_URL: (process.env.N8N_BASE_URL || 'http://n8n:5678').replace(/\/+$/, ''),
  N8N_WEBHOOK_SECRET: (process.env.N8N_WEBHOOK_SECRET || '').trim(),
  TELEGRAM_BOT_TOKEN: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
  TELEGRAM_OWNER_CHAT_ID: (process.env.TELEGRAM_OWNER_CHAT_ID || '').trim(),
  LOW_TPM_MODE: (process.env.LOW_TPM_MODE || 'true').trim().toLowerCase() === 'true',
  AI_TPM_BUDGET: parseInt(process.env.AI_TPM_BUDGET || '6000', 10),
  AI_MAX_RETRIES: parseInt(process.env.AI_MAX_RETRIES || '1', 10),
  AI_REQUEST_TIMEOUT_MS: parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '20000', 10)
};
