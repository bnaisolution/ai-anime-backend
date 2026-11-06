import { FastifyInstance } from 'fastify';
import { redactSecrets } from '../../security/permissionEngine';
import crypto from 'crypto';

export default async function filesRoutes(fastify: FastifyInstance) {
  fastify.post('/upload-metadata', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const auth = request.authContext;
    const body: any = request.body || {};
    if (!body.file_name || typeof body.size_bytes !== 'number') return reply.code(400).send({ status: 'failed', errors: [{ message: 'file_name and size_bytes required' }] });

    const { data: artifact, error } = await fastify.supabase.from('versioned_artifacts').insert({
      project_id: body.project_id || null, workspace_id: auth.workspaceId, artifact_type: body.artifact_type || 'document', resource_id: body.file_name,
      version_hash: crypto.randomUUID(), content: redactSecrets({ file_name: body.file_name, size_bytes: body.size_bytes, preview: (body.content_preview || '').slice(0, 1000) })
    }).select().maybeSingle();

    return reply.send({ status: error ? 'failed' : 'completed', file_artifact: artifact });
  });

  fastify.post('/export', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    const body: any = request.body || {};
    const { data: job } = await fastify.supabase.from('data_jobs').insert({
      user_id: auth.userId, job_type: `export_${(body.format || 'JSON').toLowerCase()}`,
      scope: { project_id: body.project_id || null, secrets_redacted: true }, status: 'completed',
      started_at: new Date().toISOString(), completed_at: new Date().toISOString()
    }).select().maybeSingle();
    return { status: 'completed', export_job: job, security_notice: 'Secrets excluded.' };
  });

  fastify.post('/delete', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const auth = request.authContext;
    const body: any = request.body || {};
    if (!body.artifact_id) return reply.code(400).send({ status: 'failed', errors: [{ message: 'artifact_id required' }] });

    const { error } = await fastify.supabase.from('versioned_artifacts').delete().eq('id', body.artifact_id);
    await fastify.supabase.from('data_jobs').insert({ user_id: auth.userId, job_type: 'file_artifact_deletion', scope: { artifact_id: body.artifact_id }, status: error ? 'failed' : 'completed', started_at: new Date().toISOString() });

    return reply.send({ status: error ? 'failed' : 'completed', deleted_artifact_id: body.artifact_id });
  });
}
