import dotenv from 'dotenv';
dotenv.config();

export interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
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
  DEFAULT_USER_ID: string;
  DEFAULT_WORKSPACE_ID: string;
}

export const env: EnvConfig = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'production',
  SUPABASE_URL: (process.env.SUPABASE_URL || 'https://icypjilkcqylgbpmkyes.supabase.co').trim(),
  SUPABASE_SERVICE_ROLE_KEY: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  JWT_SECRET: (process.env.JWT_SECRET || 'fallback_jwt_secret_change_in_prod').trim(),
  OWNER_EMAILS: (process.env.OWNER_EMAILS || 'admin@example.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  TRUSTED_SERVICE_TOKEN: (process.env.TRUSTED_SERVICE_TOKEN || 'prod_backend_srv_tok_3a4b5c6d').trim(),
  GROQ_API_KEY: (process.env.GROQ_API_KEY || '').trim(),
  GROQ_MODEL: (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim(),
  GEMINI_API_KEY: (process.env.GEMINI_API_KEY || '').trim(),
  GEMINI_MODEL: (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim(),
  N8N_BASE_URL: (process.env.N8N_BASE_URL || 'http://n8n:5678').replace(/\/+$/, ''),
  N8N_WEBHOOK_SECRET: (process.env.N8N_WEBHOOK_SECRET || 'prod_n8n_srv_tok_7f8a9b2c').trim(),
  TELEGRAM_BOT_TOKEN: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
  TELEGRAM_OWNER_CHAT_ID: (process.env.TELEGRAM_OWNER_CHAT_ID || '').trim(),
  DEFAULT_USER_ID: process.env.WF00_AUTHENTICATED_USER_ID || '11111111-1111-1111-1111-111111111111',
  DEFAULT_WORKSPACE_ID: '11111111-1111-1111-1111-111111111111'
};
