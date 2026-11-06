import { FastifyInstance } from 'fastify';
import { evaluateAuthorization } from '../../security/permissionEngine';
import { WORKFLOW_REGISTRY } from '../../security/executionGuard';
import { DATA_RETENTION_REGISTRY } from '../memory/memory.routes';

export const BASELINE_34_TABLES = [
  'approval_records', 'assistant_configs', 'audit_events', 'backup_metadata', 'checkpoints',
  'conversation_summaries', 'conversations', 'data_jobs', 'doc_research_cache', 'error_recovery_records',
  'execution_records', 'feedback_records', 'gateway_requests', 'integrations', 'knowledge_sources',
  'memory_items', 'messages', 'notification_deliveries', 'notifications', 'projects',
  'prompt_versions', 'provider_configs', 'reminders', 'skill_dependencies', 'skill_versions',
  'skills', 'task_steps', 'tasks', 'users', 'versioned_artifacts',
  'workflow_audit_findings', 'workflow_audits', 'workspace_memberships', 'workspaces'
];

export const RELEASE_COMPATIBILITY_MATRIX = {
  release_state: 'HEALTH_VERIFIED',
  backend_version: '3.1.0',
  min_supported_android_version: '3.1.0',
  database_schema_version: '2026.10.v3.1',
  n8n_contract_baseline: 'WF-00..WF-13',
  environment_isolation: { environment: 'production', staging_writes_blocked: true },
  dependencies_reviewed: [{ name: 'fastify', version: '4.28.1', licence: 'MIT', status: 'approved' }]
};

export default async function ownerRoutes(fastify: FastifyInstance) {
  fastify.get('/dashboard', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const authz = await evaluateAuthorization(fastify, { auth: request.authContext, action: 'VIEW_OWNER', resourceType: 'owner_dashboard', risk: 'read_only', requireOwner: true });
    if (!authz.allowed) return reply.code(authz.httpStatus).send({ status: 'failed', errors: [{ message: authz.reason }] });

    return reply.send({
      status: 'completed', version: '3.1.0', compatibility_matrix: RELEASE_COMPATIBILITY_MATRIX,
      workflow_registry: Object.values(WORKFLOW_REGISTRY), data_retention_registry: DATA_RETENTION_REGISTRY,
      schema_baseline_count: BASELINE_34_TABLES.length,
      rpo_rto_targets: { rpo_target: '24 hours', rto_target: '2 hours' }
    });
  });

  fastify.get('/schema-registry', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const authz = await evaluateAuthorization(fastify, { auth: request.authContext, action: 'VIEW_SCHEMA', resourceType: 'database_schema', risk: 'read_only', requireOwner: true });
    if (!authz.allowed) return reply.code(authz.httpStatus).send({ status: 'failed', errors: [{ message: authz.reason }] });
    return reply.send({ status: 'completed', baseline_tables: BASELINE_34_TABLES, auto_ddl_on_startup: false });
  });
}
