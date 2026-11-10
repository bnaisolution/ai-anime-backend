import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import * as infrastructure from '../infrastructure/infrastructure.service';
import { assertPlatformManagedEnabled } from './platform.service';

export interface ComputeRequirements {
  requires_gpu?: boolean;
  requires_video?: boolean;
  requires_audio?: boolean;
  requires_llm?: boolean;
  preferred_provider?: string;
  preferred_mode?: 'byod' | 'platform_managed';
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
  infrastructure_id: string | null;
  fallback: boolean;
  reason: string;
}

const GPU_PROVIDERS = new Set(['own_gpu', 'kaggle', 'github_actions']);
const VIDEO_PROVIDERS = new Set(['ffmpeg', 'own_gpu', 'kaggle', 'github_actions']);
const AUDIO_PROVIDERS = new Set(['tts', 'own_gpu']);
const LLM_PROVIDERS = new Set(['groq', 'gemini']);
const ALL_PROVIDERS = new Set(['own_gpu', 'kaggle', 'github_actions', 'ffmpeg', 'tts', 'groq', 'gemini']);

function pick(candidates: ComputeCandidate[], allowed: Set<string>, preferred?: string): ComputeCandidate | null {
  const active = candidates.filter((candidate) => candidate.status === 'active' && allowed.has(candidate.provider_type));
  if (preferred) {
    const exact = active.find((candidate) => candidate.provider_type === preferred || candidate.id === preferred);
    if (exact) return exact;
  }
  return active[0] ?? null;
}

export function selectComputePlan(candidates: ComputeCandidate[], requirements: ComputeRequirements): ComputePlan {
  const preferred = requirements.preferred_provider;
  const needsGpu = requirements.requires_gpu === true || requirements.requires_video === true;
  const needsAudio = requirements.requires_audio === true;
  const needsLlm = requirements.requires_llm === true;

  if (needsGpu) {
    const gpu = pick(candidates, GPU_PROVIDERS, preferred);
    if (gpu) {
      return {
        engine: 'gpu',
        provider_type: gpu.provider_type,
        infrastructure_id: gpu.id,
        fallback: false,
        reason: 'Selected an active GPU-capable BYOD provider.',
      };
    }
    if (requirements.requires_video === true) {
      const cpu = pick(candidates, VIDEO_PROVIDERS, preferred);
      if (cpu) {
        return {
          engine: 'cpu',
          provider_type: cpu.provider_type,
          infrastructure_id: cpu.id,
          fallback: true,
          reason: 'No GPU provider is active; selected an active CPU video provider as fallback.',
        };
      }
    }
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'No active GPU-capable provider is configured.' });
  }

  if (needsAudio) {
    const audio = pick(candidates, AUDIO_PROVIDERS, preferred);
    if (!audio) throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'No active audio provider is configured.' });
    return { engine: 'cpu', provider_type: audio.provider_type, infrastructure_id: audio.id, fallback: false, reason: 'Selected an active audio provider.' };
  }

  if (needsLlm) {
    const llm = pick(candidates, LLM_PROVIDERS, preferred);
    if (!llm) throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'No active LLM provider is configured.' });
    return { engine: 'cpu', provider_type: llm.provider_type, infrastructure_id: llm.id, fallback: false, reason: 'Selected an active LLM provider.' };
  }

  const first = pick(candidates, ALL_PROVIDERS, preferred);
  if (!first) throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'No active BYOD provider is configured.' });
  return {
    engine: GPU_PROVIDERS.has(first.provider_type) ? 'gpu' : 'cpu',
    provider_type: first.provider_type,
    infrastructure_id: first.id,
    fallback: false,
    reason: 'Selected the first active BYOD provider.',
  };
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
