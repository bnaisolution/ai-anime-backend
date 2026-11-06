import { FastifyInstance } from 'fastify';
import { redactSecrets } from '../../security/permissionEngine';
import crypto from 'crypto';

export const DATA_RETENTION_REGISTRY = [
  { category: 'conversation_data', retention_days: 365, deletion_supported: true },
  { category: 'user_memory', retention_days: 730, deletion_supported: true },
  { category: 'project_memory', retention_days: 730, deletion_supported: true },
  { category: 'screenshots', retention_days: 7, deletion_supported: true },
  { category: 'audit_events', retention_days: 1095, deletion_supported: false }
];

export default async function memoryRoutes(fastify: FastifyInstance) {
  fastify.get('/retention-policies', { preHandler: [fastify.authenticate] }, async () => {
    return { status: 'completed', policies: DATA_RETENTION_REGISTRY };
  });

  fastify.post('/read', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const body = (request.body as any) || {};
    let query = fastify.supabase.from('memory_items').select('*').eq('owner_id', auth.userId).neq('knowledge_status', 'superseded').limit(25);
    if (body.project_id) query = query.eq('project_id', body.project_id);
    const { data, error } = await query;
    return { status: error ? 'failed' : 'completed', memory_items: data || [] };
  });

  fastify.post('/write', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const body = (request.body as any) || {};
    if (!body.content) return { status: 'failed', errors: [{ message: 'content required' }] };
    const { data } = await fastify.supabase.from('memory_items').insert({
      owner_id: auth.userId, workspace_id: auth.workspaceId, project_id: body.project_id || null,
      scope: body.scope || 'project', content: String(redactSecrets(body.content)).slice(0, 10000),
      category: body.category || 'general', knowledge_status: 'observed', idempotency_key: `MEM-${crypto.randomUUID()}`
    }).select().maybeSingle();
    return { status: 'completed', memory_item: data };
  });

  fastify.post('/delete', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const body = (request.body as any) || {};
    await fastify.supabase.from('memory_items').delete().eq('id', body.memory_id).eq('owner_id', auth.userId);
    await fastify.supabase.from('data_jobs').insert({ user_id: auth.userId, job_type: 'memory_deletion', status: 'completed', started_at: new Date().toISOString() });
    return { status: 'completed', deleted_id: body.memory_id };
  });
}
