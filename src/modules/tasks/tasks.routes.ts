import { FastifyInstance } from 'fastify';

export default async function tasksRoutes(fastify: FastifyInstance) {
  fastify.get('/list', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const { data } = await fastify.supabase.from('tasks').select('*').eq('user_id', auth.userId).eq('workspace_id', auth.workspaceId).order('updated_at', { ascending: false }).limit(50);
    return { status: 'completed', tasks: data || [] };
  });

  fastify.post('/cancel', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const auth = request.authContext;
    const body = (request.body as any) || {};
    if (!body.task_id) return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'task_id required' }] });

    const { data: task } = await fastify.supabase.from('tasks').select('*').eq('id', body.task_id).eq('user_id', auth.userId).eq('workspace_id', auth.workspaceId).maybeSingle();
    if (!task) return reply.code(404).send({ status: 'failed', errors: [{ category: 'NOT_FOUND', message: 'Task not found' }] });

    const currentStatus = String(task.status || '').toLowerCase();
    if (['completed', 'failed', 'cancelled'].includes(currentStatus)) {
      return reply.send({ status: 'completed', cancellation_state: 'task_already_terminal', task_status: currentStatus, message: `Task is already in terminal state '${currentStatus}'` });
    }

    const nextStatus = currentStatus === 'running' ? 'paused' : 'cancelled';
    const blockedReason = currentStatus === 'running' ? 'CANCELLATION_REQUESTED: Task was running; verify reconciliation before retry' : 'CANCELLED_BY_USER';

    const { data: updated } = await fastify.supabase.from('tasks').update({ status: nextStatus, blocked_reason: blockedReason, updated_at: new Date().toISOString() }).eq('id', body.task_id).select().maybeSingle();
    return reply.send({ status: 'completed', cancellation_state: currentStatus === 'running' ? 'cancellation_requested' : 'cancellation_confirmed', task: updated });
  });

  fastify.post('/reconcile', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const auth = request.authContext;
    const body = (request.body as any) || {};
    if (!body.task_id) return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'task_id required' }] });

    const newStatus = body.resolution === 'mark_ready_for_retry' ? 'ready' : 'failed';
    const { data: updated } = await fastify.supabase.from('tasks').update({ status: newStatus, blocked_reason: `Reconciled by user (${body.resolution || 'mark_failed'})`, updated_at: new Date().toISOString() }).eq('id', body.task_id).eq('user_id', auth.userId).eq('workspace_id', auth.workspaceId).select().maybeSingle();

    await fastify.supabase.from('error_recovery_records').insert({ task_id: body.task_id, error_type: 'AMBIGUOUS_EXECUTION_RECONCILIATION', error_message: 'Reconciled via v3.0 Task Recovery API', retry_number: 1, recovery_action: body.resolution || 'mark_failed', recovery_status: 'resolved', resolved_at: new Date().toISOString() });
    return reply.send({ status: 'completed', reconciled_task: updated });
  });
}
