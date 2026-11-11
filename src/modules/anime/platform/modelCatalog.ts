import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import { getProvider, type ProviderDefinition } from './providerRegistry';

export type ModelSelectionMode = 'auto' | 'simple' | 'advanced';
export type ModelTask = 'chat' | 'embedding' | 'image' | 'video' | 'animation' | 'lipsync' | 'voice' | 'ffmpeg';

export interface ModelDefinition {
  id: string;
  label: string;
  task: ModelTask;
  providers: string[];
  min_vram_gb: number;
  dependencies: string[];
  weights: string[];
  quality: number;
  speed: number;
  paid: boolean;
  platform_managed: boolean;
}

export interface ModelSelectionInput {
  mode?: ModelSelectionMode;
  task: ModelTask;
  provider_id?: string;
  model_id?: string;
  vram_gb?: number;
  dependencies?: string[];
  weights?: string[];
  allow_paid_fallback?: boolean;
  platform_managed?: boolean;
}

export interface ModelSelectionResult {
  mode: ModelSelectionMode;
  model: ModelDefinition | null;
  compatible: boolean;
  reason: string;
  alternatives: string[];
  requires_paid_approval: boolean;
}

const MODELS: ModelDefinition[] = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Groq)', task: 'chat', providers: ['groq'], min_vram_gb: 0, dependencies: [], weights: [], quality: 4, speed: 5, paid: false, platform_managed: false },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', task: 'chat', providers: ['gemini'], min_vram_gb: 0, dependencies: [], weights: [], quality: 4, speed: 5, paid: false, platform_managed: false },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'Llama 3.1 Nemotron 70B (NVIDIA NIM)', task: 'chat', providers: ['nvidia_nim'], min_vram_gb: 0, dependencies: [], weights: [], quality: 5, speed: 4, paid: false, platform_managed: false },
  { id: 'openai-compatible-chat', label: 'OpenAI-Compatible Chat', task: 'chat', providers: ['openai_compatible'], min_vram_gb: 0, dependencies: [], weights: [], quality: 4, speed: 4, paid: false, platform_managed: false },
  { id: 'text-embedding-004', label: 'Gemini Text Embedding 004', task: 'embedding', providers: ['gemini'], min_vram_gb: 0, dependencies: [], weights: [], quality: 4, speed: 5, paid: false, platform_managed: false },
  { id: 'nvidia-nim-embedding', label: 'NVIDIA NIM Embedding', task: 'embedding', providers: ['nvidia_nim', 'openai_compatible'], min_vram_gb: 0, dependencies: [], weights: [], quality: 4, speed: 4, paid: false, platform_managed: false },
  { id: 'sdxl-lightning', label: 'SDXL Lightning', task: 'image', providers: ['kaggle', 'colab', 'lightning_ai', 'paid_gpu', 'custom_gpu', 'platform_gpu_pool'], min_vram_gb: 8, dependencies: ['torch', 'diffusers'], weights: ['sdxl-lightning'], quality: 4, speed: 5, paid: false, platform_managed: false },
  { id: 'sdxl-pulid', label: 'SDXL + PuLID', task: 'image', providers: ['kaggle', 'colab', 'lightning_ai', 'paid_gpu', 'custom_gpu', 'platform_gpu_pool'], min_vram_gb: 10, dependencies: ['torch', 'diffusers', 'insightface'], weights: ['sdxl', 'pulid'], quality: 5, speed: 4, paid: false, platform_managed: false },
  { id: 'flux-dev', label: 'FLUX.1 Dev', task: 'image', providers: ['kaggle', 'colab', 'lightning_ai', 'paid_gpu', 'custom_gpu', 'platform_gpu_pool'], min_vram_gb: 16, dependencies: ['torch', 'diffusers'], weights: ['flux-dev'], quality: 5, speed: 3, paid: false, platform_managed: false },
  { id: 'animatediff-lightning', label: 'AnimateDiff Lightning', task: 'animation', providers: ['kaggle', 'colab', 'lightning_ai', 'paid_gpu', 'custom_gpu', 'platform_gpu_pool'], min_vram_gb: 12, dependencies: ['torch', 'diffusers'], weights: ['animatediff-lightning'], quality: 4, speed: 5, paid: false, platform_managed: false },
  { id: 'animatediff', label: 'AnimateDiff', task: 'animation', providers: ['kaggle', 'colab', 'lightning_ai', 'paid_gpu', 'custom_gpu', 'platform_gpu_pool'], min_vram_gb: 14, dependencies: ['torch', 'diffusers'], weights: ['animatediff'], quality: 5, speed: 3, paid: false, platform_managed: false },
  { id: 'musetalk', label: 'MuseTalk Lip-Sync', task: 'lipsync', providers: ['kaggle', 'colab', 'lightning_ai', 'paid_gpu', 'custom_gpu', 'platform_gpu_pool'], min_vram_gb: 12, dependencies: ['torch', 'musetalk'], weights: ['musetalk'], quality: 4, speed: 4, paid: false, platform_managed: false },
  { id: 'liveportrait', label: 'LivePortrait', task: 'lipsync', providers: ['kaggle', 'colab', 'lightning_ai', 'paid_gpu', 'custom_gpu', 'platform_gpu_pool'], min_vram_gb: 10, dependencies: ['torch', 'liveportrait'], weights: ['liveportrait'], quality: 5, speed: 4, paid: false, platform_managed: false },
  { id: 'svara-tts', label: 'Svara TTS', task: 'voice', providers: ['github_actions', 'vps', 'custom_cpu', 'custom_gpu', 'platform_cpu_pool'], min_vram_gb: 0, dependencies: ['python'], weights: ['svara'], quality: 4, speed: 5, paid: false, platform_managed: false },
  { id: 'supertonic-tts', label: 'Supertonic TTS', task: 'voice', providers: ['github_actions', 'vps', 'custom_cpu', 'custom_gpu', 'platform_cpu_pool'], min_vram_gb: 0, dependencies: ['python'], weights: ['supertonic'], quality: 5, speed: 4, paid: false, platform_managed: false },
  { id: 'ffmpeg-render', label: 'FFmpeg Episode Render', task: 'ffmpeg', providers: ['github_actions', 'vps', 'custom_cpu', 'platform_cpu_pool'], min_vram_gb: 0, dependencies: ['ffmpeg'], weights: [], quality: 4, speed: 4, paid: false, platform_managed: false },
];

const BY_ID = new Map(MODELS.map((model) => [model.id, model]));
const TASK_ORDER: ModelTask[] = ['chat', 'embedding', 'image', 'video', 'animation', 'lipsync', 'voice', 'ffmpeg'];

export function listModels(task?: ModelTask): ModelDefinition[] {
  return MODELS.filter((model) => !task || model.task === task);
}

export function getModel(id: string): ModelDefinition | null {
  return BY_ID.get(String(id || '').trim()) ?? null;
}

export function listModelTasks(): ModelTask[] {
  return [...TASK_ORDER];
}

function hasAll(available: string[] | undefined, required: string[]): boolean {
  if (required.length === 0) return true;
  if (!available || available.length === 0) return false;
  const set = new Set(available.map((item) => item.toLowerCase()));
  return required.every((item) => set.has(item.toLowerCase()));
}

function providerForModel(model: ModelDefinition, providerId?: string): ProviderDefinition | null {
  if (providerId) {
    const provider = getProvider(providerId);
    if (!provider || !model.providers.includes(provider.id)) return null;
    return provider;
  }
  for (const id of model.providers) {
    const provider = getProvider(id);
    if (provider) return provider;
  }
  return null;
}

export function validateModelCompatibility(model: ModelDefinition, input: ModelSelectionInput): { compatible: boolean; reason: string } {
  if (input.task !== model.task) return { compatible: false, reason: `Model ${model.id} is for ${model.task}, not ${input.task}.` };
  const provider = providerForModel(model, input.provider_id);
  if (!provider) return { compatible: false, reason: `Model ${model.id} is not compatible with the selected provider.` };
  if (input.vram_gb !== undefined && input.vram_gb < model.min_vram_gb) {
    return { compatible: false, reason: `Model ${model.id} requires ${model.min_vram_gb}GB VRAM; ${input.vram_gb}GB available.` };
  }
  if (!hasAll(input.dependencies, model.dependencies)) {
    return { compatible: false, reason: `Model ${model.id} is missing dependencies: ${model.dependencies.join(', ')}.` };
  }
  if (!hasAll(input.weights, model.weights)) {
    return { compatible: false, reason: `Model ${model.id} is missing weights: ${model.weights.join(', ')}.` };
  }
  if (model.paid && !input.allow_paid_fallback) {
    return { compatible: false, reason: `Model ${model.id} is paid and requires explicit fallback approval.` };
  }
  if (model.platform_managed && input.platform_managed !== true) {
    return { compatible: false, reason: `Model ${model.id} is only available in Platform-Managed mode.` };
  }
  return { compatible: true, reason: 'Compatible.' };
}

export function selectModel(input: ModelSelectionInput): ModelSelectionResult {
  const mode = input.mode ?? 'auto';
  if (mode === 'advanced' && !input.model_id) {
    return { mode, model: null, compatible: false, reason: 'Advanced mode requires an explicit model_id.', alternatives: [], requires_paid_approval: false };
  }
  const candidates = input.model_id
    ? [getModel(input.model_id)].filter((model): model is ModelDefinition => Boolean(model))
    : listModels(input.task);
  const evaluated = candidates.map((model) => ({ model, ...validateModelCompatibility(model, input) }));
  const compatible = evaluated.filter((item) => item.compatible);
  if (compatible.length === 0) {
    return {
      mode,
      model: null,
      compatible: false,
      reason: evaluated[0]?.reason ?? `No model is available for task ${input.task}.`,
      alternatives: evaluated.map((item) => item.model.id),
      requires_paid_approval: evaluated.some((item) => item.model.paid && !input.allow_paid_fallback),
    };
  }
  const ranked = [...compatible].sort((a, b) => {
    if (mode === 'simple') return b.model.speed - a.model.speed || b.model.quality - a.model.quality;
    return b.model.quality - a.model.quality || b.model.speed - a.model.speed;
  });
  const selected = ranked[0].model;
  return {
    mode,
    model: selected,
    compatible: true,
    reason: mode === 'simple' ? 'Selected the fastest compatible model.' : 'Selected the highest-quality compatible model.',
    alternatives: ranked.slice(1).map((item) => item.model.id),
    requires_paid_approval: false,
  };
}

export function assertModelCompatible(modelId: string, input: ModelSelectionInput): ModelDefinition {
  const model = getModel(modelId);
  if (!model) throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: `Unknown model ${modelId}.` });
  const result = validateModelCompatibility(model, { ...input, model_id: modelId });
  if (!result.compatible) throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: result.reason });
  return model;
}
