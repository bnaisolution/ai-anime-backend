import { FastifyInstance } from 'fastify';

export default async function capabilitiesRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const auth = request.authContext;
    return {
      status: 'completed',
      backend_version: '3.1.0',
      caller_role: auth.role,
      session_mode: request.headers['x-session-mode'] || 'Auto',
      active_project_id: request.headers['x-project-id'] || 'default',
      projects: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          namespace: 'Assistant',
          name: 'Project A — AI Assistant App'
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          namespace: 'Cinematic',
          name: 'Project B — AI Cinematic Engine'
        }
      ],
      capability_groups: {
        authentication_session: '/api/v1/auth',
        primary_ai_brain_chat_and_execute: '/api/v1/ai',
        skills_and_blueprint_intelligence: '/api/v1/skills',
        copilot_diagnosis_diff_and_inspector: '/api/v1/copilot',
        sandbox_protected_changes_and_recovery: '/api/v1/trusted-controller',
        approvals_sha256_engine: '/api/v1/approvals',
        tasks_and_reconciliation: '/api/v1/tasks',
        cinematic_studio_pipeline: '/api/v1/cinematic',
        seven_layer_memory: '/api/v1/memory',
        files_and_exports: '/api/v1/files',
        notifications_and_reminders: '/api/v1/notifications',
        workflow_and_contract_registry: '/api/v1/n8n',
        owner_admin_console: '/api/v1/owner',
        normal_user_dashboard: '/api/v1/user'
      }
    };
  });
}
