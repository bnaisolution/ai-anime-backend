import { FastifyInstance } from 'fastify';
import { buildPrimaryBrainPlan, BACKEND_TOOL_REGISTRY } from '../../core/tool-registry/toolRegistry';
import crypto from 'crypto';

const MODULAR_SKILLS_REGISTRY = [
  { key: 'ai_admin', name: 'AI Admin', description: 'Hinglish Assistant & Context Routing', ownerOnly: false },
  { key: 'n8n_wf_builder', name: 'n8n WF Builder', description: 'Blueprint -> Generate -> Validate -> 5x Repair', ownerOnly: false },
  { key: 'copilot', name: 'AI Copilot', description: 'Error Diagnosis & Diff Viewer', ownerOnly: false },
  { key: 'cinematic_director', name: 'Cinematic Director', description: 'Story Bible & Scene Pipeline', ownerOnly: false },
  { key: 'owner_admin', name: 'Owner Admin Console', description: 'System Health & Protected Deploy', ownerOnly: true }
];

const repairJobs = new Map<string, any>();

export default async function skillsV31Routes(fastify: FastifyInstance) {
  // 1. GET /api/v1/skills/list
  fastify.get('/list', { preHandler: [fastify.authenticate] }, async (request) => {
    const isOwner = request.authContext.role === 'owner_admin';
    return {
      status: 'completed',
      skills: MODULAR_SKILLS_REGISTRY.filter(s => !s.ownerOnly || isOwner),
      tools: Object.values(BACKEND_TOOL_REGISTRY)
    };
  });

  // 2. POST /api/v1/skills/analyze-blueprint
  fastify.post('/analyze-blueprint', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body: any = request.body || {};
    const text = String(body.blueprint_text || '').trim();
    if (text.length < 10) return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'blueprint_text (min 10 chars) required' }] });

    const plan = buildPrimaryBrainPlan(text, body.project_id, body.skill_key);

    return reply.send({
      status: 'completed',
      intelligence_engine: 'Backend WF-11..WF-19 Unified Analyzer',
      orchestration_plan: plan,
      wf_counts: {
        existing_wfs_reused: 11,
        new_wfs_proposed: 0,
        backend_modules_reused: Object.keys(BACKEND_TOOL_REGISTRY).length
      }
    });
  });

  // 3. POST /api/v1/skills/repair-loop/record
  fastify.post('/repair-loop/record', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body: any = request.body || {};
    const jobId = body.build_job_id || crypto.randomUUID();
    let job = repairJobs.get(jobId);

    if (!job) {
      job = { buildJobId: jobId, userId: request.authContext.userId, attemptsUsed: 0, maxAttempts: 5, status: 'in_progress', history: [] };
      repairJobs.set(jobId, job);
    }

    if (body.validation_passed) {
      job.status = 'passed';
      return reply.send({ status: 'completed', build_job: job, can_retry_repair: false, message: 'Validation PASSED.' });
    }

    if (job.attemptsUsed >= job.maxAttempts) {
      job.status = 'failed_max_attempts';
      return reply.code(409).send({ status: 'failed', build_job: job, can_retry_repair: false, errors: [{ message: 'Max 5 repair attempts reached.' }] });
    }

    job.attemptsUsed += 1;
    job.history.push({ attempt: job.attemptsUsed, issues: body.issues || [], timestamp: new Date().toISOString() });
    if (job.attemptsUsed >= job.maxAttempts) job.status = 'failed_max_attempts';

    return reply.send({ status: 'completed', build_job: job, can_retry_repair: job.attemptsUsed < job.maxAttempts, remaining: job.maxAttempts - job.attemptsUsed });
  });
}
