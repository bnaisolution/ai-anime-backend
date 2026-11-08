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
  SUPABASE_SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  JWT_EXPIRES_IN: string;
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
}

export const env: EnvConfig = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV,
  SUPABASE_URL: (process.env.SUPABASE_URL || 'https://icypjilkcqylgbpmkyes.supabase.co').trim(),
  SUPABASE_SERVICE_ROLE_KEY: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  JWT_SECRET,
  JWT_ISSUER: required('JWT_ISSUER'),
  JWT_AUDIENCE: required('JWT_AUDIENCE'),
  JWT_EXPIRES_IN: (process.env.JWT_EXPIRES_IN || '1h').trim(),
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
  TELEGRAM_OWNER_CHAT_ID: (process.env.TELEGRAM_OWNER_CHAT_ID || '').trim()
};
