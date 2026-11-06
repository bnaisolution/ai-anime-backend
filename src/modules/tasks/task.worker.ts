import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { env } from '../../config/env';

export default fp(async (fastify: FastifyInstance) => {
  // Har 5 second me kaam karega
  const intervalId = setInterval(async () => {
    try {
      // 1. Atomic Claim: Sirf 'created' status wale tasks uthao
      const { data: tasks, error } = await fastify.supabase
        .from('tasks')
        .select('*')
        .eq('status', 'created')
        .limit(5);

      if (error || !tasks || tasks.length === 0) return;

      for (const task of tasks) {
        // Task ko lock karo (running mark karo)
        const { data: updatedTask } = await fastify.supabase
          .from('tasks')
          .update({ status: 'running', started_at: new Date().toISOString() })
          .eq('id', task.id)
          .eq('status', 'created')
          .select()
          .maybeSingle();

        if (!updatedTask) continue; // Koi aur worker pehle hi utha le gaya

        fastify.log.info(`[Task Worker] Executing Task ID: ${task.id}`);

        // 2. Execute Task via n8n WF-08
        try {
          const wf08Url = `${env.N8N_BASE_URL}/webhook/wf08-task`;
          const payload = {
            request_id: crypto.randomUUID(),
            user_id: task.user_id,
            workspace_id: task.workspace_id,
            project_id: task.project_id,
            operation: 'UPDATE_TASK',
            task_id: task.id,
            status: 'completed',
            result: { message: 'Executed by Background Worker' }
          };

          const res = await fetch(wf08Url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-service-token': 'Neeraj@923456789' },
            body: JSON.stringify(payload)
          });

          if (!res.ok) throw new Error(`WF-08 returned ${res.status}`);

          // 3. Mark Completed
          await fastify.supabase.from('tasks').update({
            status: 'completed',
            completed_at: new Date().toISOString()
          }).eq('id', task.id);

        } catch (execErr: any) {
          fastify.log.error(`[Task Worker] Failed Task ID: ${task.id}`, execErr);
          // Fail hone par retry count badhao
          await fastify.supabase.from('tasks').update({
            status: 'failed',
            error_info: { message: execErr.message }
          }).eq('id', task.id);
        }
      }
    } catch (e: any) {
      fastify.log.error('[Task Worker] Polling Error', e);
    }
  }, 5000);

  fastify.addHook('onClose', (instance, done) => {
    clearInterval(intervalId);
    done();
  });
});
