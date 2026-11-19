import type { FastifyInstance } from 'fastify';
import type { AuthContext } from '../../../plugins/auth';
import { getDirectorCapability, roleSatisfiesIntent, type ResourceKey } from './director.capabilities';
import { buildDirectorReadiness, missingResourcesFor, type DirectorReadiness } from './director.readiness';
import { buildActionProposal, type DirectorActionProposal, type RequestedDirectorAction } from './director.actions';
import { buildDirectorContext } from './director.context';

/**
 * Deterministic multi-step plan builder. Each step is validated server-side against the
 * capability registry, the caller role and the current BYOD readiness matrix. The plan
 * never executes anything: every step still needs its own server-signed action id.
 */

export interface DirectorPlanStepInput {
  intent: string;
  season_no?: number | null;
  episode_no?: number | null;
  payload?: Record<string, unknown> | null;
}

export interface DirectorPlanStep {
  order: number;
  capability: string;
  label: string;
  risk: string;
  required_role: string;
  required_resources: ResourceKey[];
  missing_resources: ResourceKey[];
  ready: boolean;
  blocked_reason: string | null;
  action: DirectorActionProposal | null;
}

export interface DirectorPlan {
  plan_id: string;
  project_id: string;
  goal: string | null;
  overall: DirectorReadiness['overall'];
  steps: DirectorPlanStep[];
  created_at: string;
}

const MAX_PLAN_STEPS = 6;

const DEFAULT_EPISODE_PLAN: DirectorPlanStepInput[] = [
  { intent: 'CHECK_CONTINUITY' },
  { intent: 'GENERATE_EPISODE' },
  { intent: 'RUN_QC' },
  { intent: 'PUBLISH_NOW', payload: { publish_platforms: ['youtube'] } },
];

export async function buildDirectorPlan(
  fastify: FastifyInstance,
  auth: AuthContext,
  projectRole: string,
  input: {
    projectId: string;
    goal?: string | null;
    steps?: DirectorPlanStepInput[] | null;
  }
): Promise<DirectorPlan> {
  const requestedSteps = (input.steps && input.steps.length > 0)
    ? input.steps.slice(0, MAX_PLAN_STEPS)
    : DEFAULT_EPISODE_PLAN;

  const readiness = await buildDirectorReadiness(fastify, auth, input.projectId);
  let contextVersion = '';
  let targetDurationSec = 0;
  let episode: Awaited<ReturnType<typeof buildDirectorContext>>['episode'] = null;
  try {
    const context = await buildDirectorContext(fastify, auth, { projectId: input.projectId, projectRole });
    contextVersion = context.context_version;
    targetDurationSec = context.target.targetDurationSec;
    episode = context.episode;
  } catch {
    contextVersion = `plan:${Date.now()}`;
    targetDurationSec = 0;
  }

  const steps: DirectorPlanStep[] = requestedSteps.map((step, index) => {
    const intent = String(step.intent || '').trim().toUpperCase();
    const capability = getDirectorCapability(intent);
    if (!capability) {
      return {
        order: index + 1,
        capability: intent || 'UNKNOWN',
        label: intent || 'Unknown action',
        risk: 'unknown',
        required_role: 'owner',
        required_resources: [],
        missing_resources: [],
        ready: false,
        blocked_reason: 'CAPABILITY_NOT_AVAILABLE',
        action: null,
      };
    }

    const missing = missingResourcesFor(readiness, capability.key);
    const roleOk = roleSatisfiesIntent(capability.key, projectRole);
    const productionIntents = new Set(['GENERATE_EPISODE', 'CONTINUE_EPISODE', 'REGENERATE_EPISODE', 'RUN_QC', 'PUBLISH_NOW']);
    const projectReady = readiness.setup.project?.ready_for_production === true;
    const qcPassed = ['PASS', 'PASSED', 'APPROVED', 'QC_PASSED'].includes(String(episode?.qc_status || '').toUpperCase());
    const episodeApproved = String(episode?.approval_status || '').toUpperCase() === 'APPROVED';
    let action: DirectorActionProposal | null = null;
    let blockedReason: string | null = null;

    if (!roleOk) {
      blockedReason = 'ROLE_NOT_ALLOWED';
    } else if (missing.length > 0) {
      blockedReason = `SETUP_REQUIRED:${missing.join(',')}`;
    } else if (productionIntents.has(capability.key) && !projectReady) {
      blockedReason = `SETUP_REQUIRED:${readiness.setup.next_step}`;
    } else if ((capability.key === 'RUN_QC' || capability.key === 'PUBLISH_NOW') && !episode) {
      blockedReason = 'EPISODE_NOT_FOUND';
    } else if (capability.key === 'PUBLISH_NOW' && (!qcPassed || !episodeApproved)) {
      blockedReason = `APPROVAL_REQUIRED:${[!qcPassed ? 'qc_pass' : null, !episodeApproved ? 'episode_approval' : null].filter(Boolean).join(',')}`;
    } else {
      try {
        action = buildActionProposal({
          userId: auth.userId,
          projectId: input.projectId,
          contextVersion,
          targetDurationSec,
          requested: {
            intent: capability.intent,
            payload: step.payload || {},
            season_no: step.season_no ?? null,
            episode_no: step.episode_no ?? null,
            target_duration_sec: null,
            mode: capability.mode,
          } as RequestedDirectorAction,
        });
      } catch (error) {
        blockedReason = error instanceof Error ? error.message : 'ACTION_BUILD_FAILED';
      }
    }

    return {
      order: index + 1,
      capability: capability.key,
      label: capability.label,
      risk: capability.risk,
      required_role: capability.required_role,
      required_resources: capability.required_resources,
      missing_resources: missing,
      ready: Boolean(action) && blockedReason === null,
      blocked_reason: blockedReason,
      action,
    };
  });

  return {
    plan_id: `plan_${Date.now().toString(36)}`,
    project_id: input.projectId,
    goal: input.goal ?? null,
    overall: readiness.overall,
    steps,
    created_at: new Date().toISOString(),
  };
}
