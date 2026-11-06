import { FastifyInstance } from 'fastify';
import { redactSecrets } from '../../security/permissionEngine';

export default async function notificationsRoutes(fastify: FastifyInstance) {
  fastify.get('/list', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const [notifsRes, remindersRes] = await Promise.all([
      fastify.supabase.from('notifications').select('*').eq('user_id', auth.userId).order('created_at', { ascending: false }).limit(30),
      fastify.supabase.from('reminders').select('*').eq('user_id', auth.userId).order('scheduled_at', { ascending: false }).limit(20)
    ]);
    return { status: 'completed', notifications: notifsRes.data || [], reminders: remindersRes.data || [] };
  });

  fastify.post('/dispatch', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const auth = request.authContext;
    const body: any = request.body || {};
    if (!body.title || !body.message) return reply.code(400).send({ status: 'failed', errors: [{ message: 'title and message required' }] });

    const safeMessage = String(redactSecrets(body.message)).slice(0, 1000);
    const { data: notif } = await fastify.supabase.from('notifications').insert({
      user_id: auth.userId, title: body.title, body: safeMessage, priority: body.priority || 'info', is_read: false
    }).select().maybeSingle();

    return reply.send({ status: 'completed', delivery_status: 'pending', provider_evidence: 'Recorded in DB', notification: notif });
  });
}
