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
    if (body.scope) query = query.eq('scope', body.scope);
    if (body.query) query = query.ilike('content', `%${String(body.query).slice(0, 200)}%`);
    const { data, error } = await query;
    return { status: error ? 'failed' : 'completed', memory_items: data || [] };
  });

  fastify.post('/write', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const body = (request.body as any) || {};
    if (!body.content) return { status: 'failed', errors: [{ message: 'content required' }] };
    const scope = body.scope || 'project';
    const content = String(redactSecrets(body.content)).slice(0, 10000);
    const dedupQuery = fastify.supabase
      .from('memory_items')
      .select('*')
      .eq('owner_id', auth.userId)
      .eq('scope', scope)
      .eq('content', content)
      .neq('knowledge_status', 'superseded')
      .limit(1);
    const { data: existing } = await dedupQuery;
    if (Array.isArray(existing) && existing.length > 0) {
      return { status: 'completed', memory_item: existing[0], deduplicated: true };
    }
    const { data } = await fastify.supabase.from('memory_items').insert({
      owner_id: auth.userId, workspace_id: auth.workspaceId, project_id: body.project_id || null,
      scope, content,
      category: body.category || 'general', knowledge_status: 'observed', idempotency_key: body.idempotency_key || `MEM-${crypto.randomUUID()}`
    }).select().maybeSingle();
    return { status: 'completed', memory_item: data, deduplicated: false };
  });

  fastify.post('/correct', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const body = (request.body as any) || {};
    if (!body.memory_id || !body.content) {
      return { status: 'failed', errors: [{ message: 'memory_id and content required' }] };
    }
    const content = String(redactSecrets(body.content)).slice(0, 10000);
    const { data } = await fastify.supabase
      .from('memory_items')
      .update({ content, knowledge_status: 'corrected' })
      .eq('id', body.memory_id)
      .eq('owner_id', auth.userId)
      .select()
      .maybeSingle();
    return { status: 'completed', memory_item: data };
  });

  fastify.post('/delete', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const body = (request.body as any) || {};
    let deleteQuery = fastify.supabase.from('memory_items').delete().eq('owner_id', auth.userId);
    if (body.memory_id) deleteQuery = deleteQuery.eq('id', body.memory_id);
    else if (body.scope) deleteQuery = deleteQuery.eq('scope', body.scope);
    else if (body.project_id) deleteQuery = deleteQuery.eq('project_id', body.project_id);
    else return { status: 'failed', errors: [{ message: 'memory_id, scope, or project_id required' }] };
    await deleteQuery;
    await fastify.supabase.from('data_jobs').insert({ user_id: auth.userId, job_type: 'memory_deletion', status: 'completed', started_at: new Date().toISOString() });
    return { status: 'completed', deleted_id: body.memory_id || null, deleted_scope: body.scope || null, deleted_project_id: body.project_id || null };
  });

  fastify.post('/reconcile', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const body = (request.body as any) || {};
    let query = fastify.supabase
      .from('memory_items')
      .select('id, scope, knowledge_status, project_id')
      .eq('owner_id', auth.userId)
      .limit(1000);
    if (body.project_id) query = query.eq('project_id', body.project_id);
    const { data, error } = await query;
    const items = Array.isArray(data) ? data : [];
    const byScope: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const item of items) {
      const scope = String(item.scope || 'project');
      const status = String(item.knowledge_status || 'observed');
      byScope[scope] = (byScope[scope] || 0) + 1;
      byStatus[status] = (byStatus[status] || 0) + 1;
    }
    return { status: error ? 'failed' : 'completed', total: items.length, by_scope: byScope, by_status: byStatus };
  });
}
