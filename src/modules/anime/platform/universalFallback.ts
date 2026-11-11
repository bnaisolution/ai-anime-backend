import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { getProvider, type ProviderBilling } from './providerRegistry';

export type FallbackMode = 'manual' | 'automatic';

export interface FallbackCandidate {
  provider_id: string;
  priority?: number;
  available?: boolean;
  healthy?: boolean;
  billing?: ProviderBilling;
  supports_checkpoint?: boolean;
  reason?: string;
}

export interface FallbackInput {
  candidates: FallbackCandidate[];
  primary_provider?: string;
  secondary_provider?: string;
  mode?: FallbackMode;
  allow_paid_fallback?: boolean;
  checkpoint?: Record<string, unknown> | null;
}

export interface FallbackStep {
  provider_id: string;
  priority: number;
  billing: ProviderBilling;
  skipped: boolean;
  reason: string;
}

export interface FallbackPlan {
  selected_provider: string | null;
  fallback: boolean;
  requires_paid_approval: boolean;
  resume_from: Record<string, unknown> | null;
  can_resume: boolean;
  reason: string;
  steps: FallbackStep[];
}

function candidateBilling(candidate: FallbackCandidate): ProviderBilling {
  if (candidate.billing) return candidate.billing;
  return getProvider(candidate.provider_id)?.billing ?? 'none';
}

function candidatePriority(candidate: FallbackCandidate, input: FallbackInput): number {
  if (candidate.priority !== undefined) return candidate.priority;
  if (input.primary_provider === candidate.provider_id) return 0;
  if (input.secondary_provider === candidate.provider_id) return 1;
  return 10;
}

export function buildFallbackPlan(input: FallbackInput): FallbackPlan {
  const mode = input.mode ?? 'automatic';
  const checkpoint = input.checkpoint ?? null;
  const seen = new Set<string>();
  const ordered = input.candidates
    .filter((candidate) => {
      if (!candidate.provider_id || seen.has(candidate.provider_id)) return false;
      seen.add(candidate.provider_id);
      return true;
    })
    .map((candidate) => ({ candidate, priority: candidatePriority(candidate, input) }))
    .sort((a, b) => a.priority - b.priority || a.candidate.provider_id.localeCompare(b.candidate.provider_id));

  if (mode === 'manual' && input.primary_provider) {
    const primary = ordered.find((item) => item.candidate.provider_id === input.primary_provider);
    if (!primary) {
      return {
        selected_provider: null,
        fallback: false,
        requires_paid_approval: false,
        resume_from: checkpoint,
        can_resume: checkpoint !== null,
        reason: 'Primary provider is not configured.',
        steps: [],
      };
    }
    ordered.splice(0, ordered.length, primary);
  }

  const steps: FallbackStep[] = [];
  let requiresPaidApproval = false;
  for (const { candidate, priority } of ordered) {
    const billing = candidateBilling(candidate);
    const unavailable = candidate.available === false || candidate.healthy === false;
    const paidBlocked = billing === 'platform' && input.allow_paid_fallback !== true;
    if (unavailable || paidBlocked) {
      if (paidBlocked) requiresPaidApproval = true;
      steps.push({
        provider_id: candidate.provider_id,
        priority,
        billing,
        skipped: true,
        reason: paidBlocked ? 'Platform-paid fallback requires explicit approval.' : (candidate.reason || 'Provider is unavailable.'),
      });
      continue;
    }
    steps.push({ provider_id: candidate.provider_id, priority, billing, skipped: false, reason: candidate.reason || 'Selected.' });
    return {
      selected_provider: candidate.provider_id,
      fallback: Boolean(input.primary_provider) && candidate.provider_id !== input.primary_provider,
      requires_paid_approval: false,
      resume_from: checkpoint,
      can_resume: checkpoint !== null && candidate.supports_checkpoint === true,
      reason: !input.primary_provider || candidate.provider_id === input.primary_provider
        ? 'Primary provider selected.'
        : `Fallback provider ${candidate.provider_id} selected.`,
      steps,
    };
  }

  return {
    selected_provider: null,
    fallback: false,
    requires_paid_approval: requiresPaidApproval,
    resume_from: checkpoint,
    can_resume: checkpoint !== null,
    reason: requiresPaidApproval
      ? 'No safe free provider is available; paid fallback requires explicit approval.'
      : 'No safe provider is available. Job state is preserved for later resume.',
    steps,
  };
}

export function assertFallbackAllowed(plan: FallbackPlan): FallbackPlan {
  if (!plan.selected_provider) {
    throw new AnimeError({
      code: plan.requires_paid_approval ? AnimeErrorCode.PAID_BUDGET_REQUIRED : AnimeErrorCode.PROVIDER_UNAVAILABLE,
      message: plan.reason,
    });
  }
  return plan;
}
