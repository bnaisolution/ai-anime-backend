import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import * as infrastructure from '../infrastructure/infrastructure.service';
import { assertPlatformManagedEnabled } from './platform.service';
import { getModel, listModels, validateModelCompatibility, type ModelSelectionMode, type ModelTask } from './modelCatalog';
import { resolveProviderDefinition, type ProviderBilling } from './providerRegistry';
import { buildFallbackPlan } from './universalFallback';

export interface ComputeRequirements {
  requires_gpu?: boolean;
  requires_video?: boolean;
  requires_audio?: boolean;
  requires_llm?: boolean;
  preferred_provider?: string;
  preferred_mode?: 'byod' | 'platform_managed';
  selection_mode?: ModelSelectionMode;
  task?: ModelTask;
  model_id?: string;
  vram_gb?: number;
  dependencies?: string[];
  weights?: string[];
  allow_paid_fallback?: boolean;
  checkpoint?: Record<string, unknown> | null;
  primary_provider?: string;
  secondary_provider?: string;
}

export interface ComputeCandidate {
  id: string;
  provider_type: string;
  status: string;
  capabilities?: Record<string, unknown>;
}

export interface ComputePlan {
  engine: 'gpu' | 'cpu';
  provider_type: string;
  provider_id: string;
  billing: ProviderBilling;
  infrastructure_id: string | null;
  model_id: string | null;
  fallback: boolean;
  reason: string;
  fallback_reason: string;
  resume_from: Record<string, unknown> | null;
  requires_paid_approval: boolean;
}

const GPU_PROVIDERS = new Set(['own_gpu', 'kaggle', 'github_actions']);
const VIDEO_PROVIDERS = new Set(['ffmpeg', 'own_gpu', 'kaggle', 'github_actions']);
const AUDIO_PROVIDERS = new Set(['tts', 'own_gpu']);
const LLM_PROVIDERS = new Set(['groq', 'gemini']);
const ALL_PROVIDERS = new Set(['own_gpu', 'kaggle', 'github_actions', 'ffmpeg', 'tts', 'groq', 'gemini', 'custom']);

function providerId(candidate: ComputeCandidate): string {
  return resolveProviderDefinition(candidate.provider_type, candidate.capabilities ?? {})?.id ?? candidate.provider_type;
}

function billingOf(candidate: ComputeCandidate): ProviderBilling {
  return resolveProviderDefinition(candidate.provider_type, candidate.capabilities ?? {})?.billing ?? 'none';
}

function priorityOf(candidate: ComputeCandidate, requirements: ComputeRequirements): number {
  const raw = candidate.capabilities?.priority;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const id = providerId(candidate);
  if (requirements.primary_provider && id === requirements.primary_provider) return 0;
  if (requirements.preferred_provider && (candidate.provider_type === requirements.preferred_provider || candidate.id === requirements.preferred_provider)) return 1;
  if (requirements.secondary_provider && id === requirements.secondary_provider) return 2;
  return 10;
}

function modelForCandidate(candidate: ComputeCandidate, requirements: ComputeRequirements): { model_id: string | null; compatible: boolean; reason: string } {
  const definition = resolveProviderDefinition(candidate.provider_type, candidate.capabilities ?? {});
  if (!definition) return { model_id: null, compatible: false, reason: 'Unknown provider.' };
  if (!requirements.model_id && !requirements.task) return { model_id: null, compatible: true, reason: 'No model requested.' };
  const input = {
    mode: requirements.selection_mode ?? 'auto',
    task: requirements.task,
    provider_id: definition.id,
    model_id: requirements.model_id,
    vram_gb: requirements.vram_gb,
    dependencies: requirements.dependencies,
    weights: requirements.weights,
    allow_paid_fallback: requirements.allow_paid_fallback,
  };
  if (requirements.model_id) {
    const model = getModel(requirements.model_id);
    if (!model) return { model_id: null, compatible: false, reason: `Unknown model ${requirements.model_id}.` };
    const result = validateModelCompatibility(model, { ...input, task: model.task });
    return { model_id: model.id, compatible: result.compatible, reason: result.reason };
  }
  const task = requirements.task;
  if (!task) return { model_id: null, compatible: true, reason: 'No task requested.' };
  const compatible = listModels(task)
    .filter((model) => model.providers.includes(definition.id))
    .map((model) => ({ model, result: validateModelCompatibility(model, { ...input, task }) }))
    .filter((item) => item.result.compatible)
    .sort((a, b) => b.model.quality - a.model.quality);
  if (compatible.length === 0) return { model_id: null, compatible: false, reason: `No compatible ${task} model for ${definition.id}.` };
  return { model_id: compatible[0].model.id, compatible: true, reason: compatible[0].result.reason };
}

function compatibleCandidates(candidates: ComputeCandidate[], allowed: Set<string>, requirements: ComputeRequirements): ComputeCandidate[] {
  return candidates
    .filter((candidate) => candidate.status === 'active' && allowed.has(candidate.provider_type))
    .filter((candidate) => {
      const definition = resolveProviderDefinition(candidate.provider_type, candidate.capabilities ?? {});
      if (!definition) return false;
      if (definition.billing === 'platform' && requirements.allow_paid_fallback !== true) return false;
      return modelForCandidate(candidate, requirements).compatible;
    })
    .sort((a, b) => priorityOf(a, requirements) - priorityOf(b, requirements));
}

function planFor(candidates: ComputeCandidate[], requirements: ComputeRequirements, engine: 'gpu' | 'cpu', fallbackReason: string, forceFallback = false): ComputePlan {
  const primary = requirements.primary_provider || requirements.preferred_provider;
  const plan = buildFallbackPlan({
    candidates: candidates.map((candidate) => ({
      provider_id: providerId(candidate),
      priority: priorityOf(candidate, requirements),
      available: candidate.status === 'active',
      healthy: true,
      billing: billingOf(candidate),
      supports_checkpoint: true,
    })),
    primary_provider: primary,
    secondary_provider: requirements.secondary_provider,
    mode: requirements.selection_mode === 'advanced' ? 'manual' : 'automatic',
    allow_paid_fallback: requirements.allow_paid_fallback,
    checkpoint: requirements.checkpoint ?? null,
  });
  const selected = plan.selected_provider
    ? candidates.find((candidate) => providerId(candidate) === plan.selected_provider) ?? candidates[0]
    : null;
  if (!selected) {
    throw new AnimeError({
      code: plan.requires_paid_approval ? AnimeErrorCode.PAID_BUDGET_REQUIRED : AnimeErrorCode.PROVIDER_UNAVAILABLE,
      message: plan.reason,
    });
  }
  const model = modelForCandidate(selected, requirements);
  return {
    engine,
    provider_type: selected.provider_type,
    provider_id: providerId(selected),
    billing: billingOf(selected),
    infrastructure_id: selected.id,
    model_id: model.model_id,
    fallback: forceFallback || plan.fallback,
    reason: plan.reason,
    fallback_reason: plan.fallback ? (fallbackReason || plan.reason) : '',
    resume_from: plan.resume_from,
    requires_paid_approval: plan.requires_paid_approval,
  };
}

export function selectComputePlan(candidates: ComputeCandidate[], requirements: ComputeRequirements): ComputePlan {
  const preferred = requirements.preferred_provider;
  const needsGpu = requirements.requires_gpu === true || requirements.requires_video === true;
  const needsAudio = requirements.requires_audio === true;
  const needsLlm = requirements.requires_llm === true;

  if (needsGpu) {
    const gpu = compatibleCandidates(candidates, GPU_PROVIDERS, requirements);
    if (gpu.length > 0) return planFor(gpu, requirements, 'gpu', 'Selected an active GPU-capable provider.');
    if (requirements.requires_video === true) {
      const cpu = compatibleCandidates(candidates, VIDEO_PROVIDERS, requirements);
      if (cpu.length > 0) return planFor(cpu, requirements, 'cpu', 'No GPU provider is active; selected a CPU video provider as fallback.', true);
    }
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'No active GPU-capable provider is configured.' });
  }

  if (needsAudio) {
    const audio = compatibleCandidates(candidates, AUDIO_PROVIDERS, requirements);
    if (audio.length === 0) throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'No active audio provider is configured.' });
    return planFor(audio, requirements, 'cpu', 'Selected an active audio provider.');
  }

  if (needsLlm) {
    const llm = compatibleCandidates(candidates, LLM_PROVIDERS, requirements);
    if (llm.length === 0) throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'No active LLM provider is configured.' });
    return planFor(llm, requirements, 'cpu', 'Selected an active LLM provider.');
  }

  const first = compatibleCandidates(candidates, ALL_PROVIDERS, requirements);
  if (first.length === 0) throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'No active BYOD provider is configured.' });
  const engine = GPU_PROVIDERS.has(first[0].provider_type) ? 'gpu' : 'cpu';
  return planFor(first, requirements, engine, 'Selected the first active BYOD provider.');
}

export async function selectComputeForUser(userId: string, requirements: ComputeRequirements): Promise<ComputePlan> {
  if (requirements.preferred_mode === 'platform_managed') {
    assertPlatformManagedEnabled('compute selection');
  }
  const items = await infrastructure.list(userId);
  const candidates: ComputeCandidate[] = items.map((item) => ({
    id: item.id,
    provider_type: item.provider_type,
    status: item.status,
    capabilities: item.capabilities,
  }));
  return selectComputePlan(candidates, requirements);
}
