import type { FastifyInstance, FastifyReply } from 'fastify';

function unavailable(reply: FastifyReply, code: string) {
  void reply.code(503).send({ error: code });
}

export default async function incidentsRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate, fastify.requireOwner] }, async (_request, reply) => {
    const { data, error } = await fastify.supabase
      .from('error_recovery_records')
      .select('*')
      .neq('recovery_status', 'resolved')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return unavailable(reply, 'INCIDENTS_UNAVAILABLE');
    return data ?? [];
  });

  fastify.post('/:id/acknowledge', { preHandler: [fastify.authenticate, fastify.requireOwner] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { data: incident, error: lookupError } = await fastify.supabase
      .from('error_recovery_records')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (lookupError) return unavailable(reply, 'INCIDENT_LOOKUP_FAILED');
    if (!incident) {
      void reply.code(404);
      return { error: 'INCIDENT_NOT_FOUND' };
    }

    const { data, error } = await fastify.supabase
      .from('error_recovery_records')
      .update({ recovery_status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) return unavailable(reply, 'INCIDENT_ACKNOWLEDGE_FAILED');
    if (!data) {
      void reply.code(404);
      return { error: 'INCIDENT_NOT_FOUND' };
    }
    return { success: true, incident: data };
  });

  fastify.get('/stats', { preHandler: [fastify.authenticate, fastify.requireOwner] }, async (_request, reply) => {
    const { count: total, error: err1 } = await fastify.supabase.from('error_recovery_records').select('*', { count: 'exact', head: true });
    const { count: pending, error: err2 } = await fastify.supabase.from('error_recovery_records').select('*', { count: 'exact', head: true }).eq('recovery_status', 'pending');
    const { count: resolved, error: err3 } = await fastify.supabase.from('error_recovery_records').select('*', { count: 'exact', head: true }).eq('recovery_status', 'resolved');
    if (err1 || err2 || err3) return unavailable(reply, 'INCIDENT_STATS_UNAVAILABLE');
    return { total: total ?? 0, pending: pending ?? 0, resolved: resolved ?? 0 };
  });
}
