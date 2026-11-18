import { animeSupabase } from '../../anime/db/anime.supabase';
import { flags } from '../../../config/flags';

export type ModelCapability = 'text' | 'vision' | 'json' | 'embedding';
export type ModelPurpose = 'primary' | 'fallback' | 'vision';
export type RenderProfileKey = 'FAST' | 'STANDARD' | 'HIGH';

export interface CatalogModel {
  provider: string;
  model_id: string;
  display_name: string;
  capabilities: ModelCapability[];
  context_window: number;
  input_cost: number;
  output_cost: number;
  status: 'active' | 'beta' | 'deprecated';
  validated: boolean;
  min_plan: string;
  notes?: string;
}

export interface RenderProfile {
  key: RenderProfileKey;
  label: string;
  description: string;
  gpu_bundle: string[];
  cpu_preset: string;
  enabled: boolean;
}

/** Curated fallback catalog. The DB table can extend it without an app release. */
export const DEFAULT_MODELS: readonly CatalogModel[] = [
  {
    provider: 'groq',
    model_id: 'llama-3.3-70b-versatile',
    display_name: 'Llama 3.3 70B (Groq)',
    capabilities: ['text', 'json'],
    context_window: 131072,
    input_cost: 0.59,
    output_cost: 0.79,
    status: 'active',
    validated: true,
    min_plan: 'free',
  },
  {
    provider: 'groq',
    model_id: 'llama-3.1-8b-instant',
    display_name: 'Llama 3.1 8B Instant (Groq)',
    capabilities: ['text', 'json'],
    context_window: 131072,
    input_cost: 0.05,
    output_cost: 0.08,
    status: 'active',
    validated: true,
    min_plan: 'free',
  },
  {
    provider: 'gemini',
    model_id: 'gemini-2.0-flash',
    display_name: 'Gemini 2.0 Flash',
    capabilities: ['text', 'vision', 'json'],
    context_window: 1048576,
    input_cost: 0.1,
    output_cost: 0.4,
    status: 'active',
    validated: true,
    min_plan: 'free',
  },
  {
    provider: 'gemini',
    model_id: 'gemini-1.5-pro',
    display_name: 'Gemini 1.5 Pro',
    capabilities: ['text', 'vision', 'json'],
    context_window: 2097152,
    input_cost: 1.25,
    output_cost: 5,
    status: 'active',
    validated: true,
    min_plan: 'pro',
  },
  {
    provider: 'gemini',
    model_id: 'gemini-1.5-flash',
    display_name: 'Gemini 1.5 Flash',
    capabilities: ['text', 'vision', 'json'],
    context_window: 1048576,
    input_cost: 0.075,
    output_cost: 0.3,
    status: 'active',
    validated: true,
    min_plan: 'free',
  },
  {
    provider: 'openai_compatible',
    model_id: 'deepseek-chat',
    display_name: 'DeepSeek Chat (OpenAI-compatible)',
    capabilities: ['text', 'json'],
    context_window: 65536,
    input_cost: 0.27,
    output_cost: 1.1,
    status: 'beta',
    validated: false,
    min_plan: 'pro',
    notes: 'Requires your own OpenAI-compatible base URL and key.',
  },
  {
    provider: 'openai_compatible',
    model_id: 'openrouter/auto',
    display_name: 'OpenRouter Auto Router',
    capabilities: ['text', 'json'],
    context_window: 131072,
    input_cost: 0,
    output_cost: 0,
    status: 'beta',
    validated: false,
    min_plan: 'pro',
    notes: 'Routing and cost depend on the OpenRouter account.',
  },
];

export const RENDER_PROFILES: readonly RenderProfile[] = [
  {
    key: 'FAST',
    label: 'Fast Draft',
    description: 'Quick storyboard-grade output. SDXL-Lightning with light motion and short clips.',
    gpu_bundle: ['sdxl-lightning', 'animatediff-lightning'],
    cpu_preset: 'ffmpeg-fast',
    enabled: true,
  },
  {
    key: 'STANDARD',
    label: 'Standard',
    description: 'Balanced quality for full episodes. SDXL + PuLID identity lock + AnimateDiff.',
    gpu_bundle: ['sdxl', 'pulid', 'animatediff'],
    cpu_preset: 'ffmpeg-standard',
    enabled: true,
  },
  {
    key: 'HIGH',
    label: 'High Quality',
    description: 'Best quality. PuLID + AnimateDiff + LivePortrait + MuseTalk lip sync.',
    gpu_bundle: ['sdxl', 'pulid', 'animateddiff', 'liveportrait', 'musetalk'],
    cpu_preset: 'ffmpeg-high',
    enabled: true,
  },
];

function normalizeCapabilities(value: unknown): ModelCapability[] {
  if (!Array.isArray(value)) return ['text'];
  return value
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item): item is ModelCapability => ['text', 'vision', 'json', 'embedding'].includes(item));
}

function rowToModel(row: Record<string, unknown>): CatalogModel {
  return {
    provider: String(row.provider || ''),
    model_id: String(row.model_id || ''),
    display_name: String(row.display_name || row.model_id || ''),
    capabilities: normalizeCapabilities(row.capabilities),
    context_window: Number(row.context_window) || 0,
    input_cost: Number(row.input_cost) || 0,
    output_cost: Number(row.output_cost) || 0,
    status: (['active', 'beta', 'deprecated'].includes(String(row.status)) ? String(row.status) : 'active') as CatalogModel['status'],
    validated: row.validated === true,
    min_plan: String(row.min_plan || 'free'),
    notes: typeof row.notes === 'string' ? row.notes : undefined,
  };
}

export async function listModelCatalog(capability?: string): Promise<CatalogModel[]> {
  let models: CatalogModel[] = [...DEFAULT_MODELS];
  if (flags.modelCatalog) {
    try {
      const { data } = await animeSupabase
        .from('ai_model_catalog')
        .select('*')
        .eq('status', 'active')
        .order('provider')
        .order('model_id');
      if (Array.isArray(data) && data.length > 0) {
        models = data.map((row) => rowToModel(row as Record<string, unknown>));
      }
    } catch {
      /* fall back to the bundled catalog */
    }
  }
  const wanted = String(capability || '').trim().toLowerCase();
  if (!wanted) return models;
  return models.filter((model) => model.capabilities.includes(wanted as ModelCapability));
}

export function findModel(provider: string, modelId: string): CatalogModel | null {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const normalizedModel = String(modelId || '').trim();
  return DEFAULT_MODELS.find(
    (model) => model.provider === normalizedProvider && model.model_id === normalizedModel
  ) ?? null;
}

export function modelSupports(model: CatalogModel, capability: ModelCapability): boolean {
  return model.capabilities.includes(capability);
}

export function listRenderProfiles(): RenderProfile[] {
  return RENDER_PROFILES.filter((profile) => profile.enabled).map((profile) => ({ ...profile }));
}

export function findRenderProfile(key: string): RenderProfile | null {
  const normalized = String(key || '').trim().toUpperCase();
  return RENDER_PROFILES.find((profile) => profile.key === normalized) ?? null;
}

export interface ModelSelection {
  purpose: ModelPurpose;
  provider: string;
  model_id: string;
  render_profile?: RenderProfileKey | null;
}

export interface ModelSelectionValidation {
  valid: boolean;
  error?: string;
  model?: CatalogModel;
  profile?: RenderProfile | null;
}

export function validateModelSelection(input: ModelSelection): ModelSelectionValidation {
  const provider = String(input.provider || '').trim().toLowerCase();
  const modelId = String(input.model_id || '').trim();
  const purpose = input.purpose;

  if (!['primary', 'fallback', 'vision'].includes(purpose)) {
    return { valid: false, error: 'INVALID_PURPOSE' };
  }
  if (!provider || !modelId) {
    return { valid: false, error: 'MODEL_REQUIRED' };
  }

  const model = findModel(provider, modelId);
  if (!model) {
    return { valid: false, error: 'MODEL_INVALID' };
  }
  if (purpose === 'vision' && !modelSupports(model, 'vision')) {
    return { valid: false, error: 'MODEL_NOT_VISION_CAPABLE', model };
  }
  if ((purpose === 'primary' || purpose === 'fallback') && !modelSupports(model, 'text')) {
    return { valid: false, error: 'MODEL_NOT_TEXT_CAPABLE', model };
  }

  let profile: RenderProfile | null = null;
  if (input.render_profile) {
    profile = findRenderProfile(input.render_profile);
    if (!profile) {
      return { valid: false, error: 'PROFILE_INVALID', model };
    }
  }

  return { valid: true, model, profile };
}
