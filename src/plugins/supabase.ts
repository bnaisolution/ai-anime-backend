import fp from 'fastify-plugin';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

declare module 'fastify' {
  interface FastifyInstance {
    supabase: SupabaseClient;
    writeAuditEvent: (params: {
      user_id?: string | null; workspace_id?: string | null; project_id?: string | null;
      event_type: string; resource_type: string; resource_id: string; action: string; status: string;
      details?: Record<string, unknown>; ip_address?: string; user_agent?: string;
    }) => Promise<void>;
  }
}

export default fp(async (fastify) => {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  fastify.decorate('supabase', supabase);

  fastify.decorate('writeAuditEvent', async (params) => {
    try {
      await supabase.from('audit_events').insert({
        user_id: params.user_id || null,
        workspace_id: params.workspace_id || null,
        project_id: params.project_id || null,
        event_type: params.event_type,
        resource_type: params.resource_type,
        resource_id: params.resource_id,
        action: params.action,
        status: params.status,
        details: params.details || {},
        ip_address: params.ip_address || null,
        user_agent: params.user_agent || null
      });

      // GAP 8 FIX: Real-time Telegram Alerts for Critical Events
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_OWNER_CHAT_ID) {
        const isCritical = params.event_type === 'access_denied' || params.status === 'failed';
        if (isCritical) {
          const msg = `🚨 *SYSTEM ALERT*\n*Event:* ${params.event_type}\n*Action:* ${params.action}\n*Status:* ${params.status}\n*User:* ${params.user_id || 'Unknown'}\n*Resource:* ${params.resource_type} (${params.resource_id})\n*Reason:* ${JSON.stringify(params.details || {})}`;
          
          fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: env.TELEGRAM_OWNER_CHAT_ID, text: msg, parse_mode: 'Markdown' })
          }).catch(err => fastify.log.warn({ err }, 'Telegram alert failed'));
        }
      }
    } catch (err) {
      fastify.log.warn({ err }, 'Audit event write failed');
    }
  });
});
