import type { FastifyInstance } from 'fastify';

export default async function incidentsRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { data, error } = await fastify.supabase
        .from('error_recovery_records')
        .select('*')
        .neq('recovery_status', 'resolved')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data;
    } catch (e: any) {
      reply.code(500);
      return { error: e.message };
    }
  });

  fastify.post('/:id/acknowledge', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { data, error } = await fastify.supabase
        .from('error_recovery_records')
        .update({ recovery_status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { success: true, incident: data };
    } catch (e: any) {
      reply.code(500);
      return { error: e.message };
    }
  });

  fastify.get('/stats', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const user = request.user as any;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        reply.code(403);
        return { error: 'Forbidden: Owner access required' };
      }

      const { count: total, error: err1 } = await fastify.supabase.from('error_recovery_records').select('*', { count: 'exact', head: true });
      const { count: pending, error: err2 } = await fastify.supabase.from('error_recovery_records').select('*', { count: 'exact', head: true }).eq('recovery_status', 'pending');
      const { count: resolved, error: err3 } = await fastify.supabase.from('error_recovery_records').select('*', { count: 'exact', head: true }).eq('recovery_status', 'resolved');

      if (err1 || err2 || err3) throw new Error('Stats fetch failed');

      return { total, pending, resolved };
    } catch (e: any) {
      reply.code(500);
      return { error: e.message };
    }
  });
}
