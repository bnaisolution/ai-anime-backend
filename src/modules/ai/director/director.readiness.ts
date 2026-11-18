import type { FastifyInstance } from 'fastify';
import type { AuthContext } from '../../../plugins/auth';
import { animeSupabase } from '../../anime/db/anime.supabase';
import {
  getActiveDecryptedInfrastructureForUser,
  type DecryptedInfrastructure,
} from '../../anime/infrastructure/infrastructure.service';
import {
  listDirectorCapabilities,
  type ResourceKey,
} from './director.capabilities';

export type ReadinessStatus = 'ready' | 'degraded' | 'missing';

export interface ResourceReadiness {
  status: ReadinessStatus;
  mode?: string;
  reason?: string;
  provider?: string;
  model?: string;
}

export interface CapabilityBlock {
  capability: string;
  label: string;
  missing: ResourceKey[];
  deep_links: string[];
}

export interface SetupHint {
  resource: ResourceKey;
  message: string;
  deep_link: string;
}

export interface DirectorReadiness {
  project_id: string;
  overall: 'ready' | 'degraded' | 'blocked';
  checked_at: string;
  resources: Record<ResourceKey, ResourceReadiness>;
  blocking: CapabilityBlock[];
  setup_hints: SetupHint[];
}

const SETUP_HINTS: Record<ResourceKey, { message: string; deep_link: string }> = {
  database: { message: 'Connect your BYOD database or finish project provisioning.', deep_link: 'settings' },
  ai_text: { message: 'Add a Groq, Gemini or OpenAI-compatible text provider key.', deep_link: 'settings' },
  ai_vision: { message: 'Add a vision-capable provider such as Gemini.', deep_link: 'settings' },
  gpu: { message: 'Start your Kaggle GPU worker or register your own GPU worker URL.', deep_link: 'settings' },
  cpu: { message: 'Add a CPU worker URL (GitHub Actions runner or your own machine).', deep_link: 'settings' },
  storage: { message: 'Configure Telegram storage or an S3-compatible bucket.', deep_link: 'settings' },
  telegram: { message: 'Connect your Telegram bot token and chat id for media delivery.', deep_link: 'settings' },
  github: { message: 'Save your GitHub token, repository and workflow for CPU dispatch.', deep_link: 'settings' },
  youtube: { message: 'Connect your YouTube channel with OAuth before publishing.', deep_link: 'publish' },
  instagram: { message: 'Connect your Instagram professional account before publishing.', deep_link: 'publish' },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasWorkerUrl(config: Record<string, unknown>): boolean {
  return Boolean(text(config.worker_url) || text(config.api_endpoint) || text(config.endpoint) || text(config.health_url));
}

export async function buildDirectorReadiness(
  fastify: FastifyInstance,
  auth: AuthContext,
  projectId: string
): Promise<DirectorReadiness> {
  let records: DecryptedInfrastructure[] = [];
  try {
    records = await getActiveDecryptedInfrastructureForUser(auth.userId);
  } catch (error) {
    fastify.log.warn({ err: error }, 'Director readiness: infrastructure lookup failed');
  }

  const byType = new Map<string, DecryptedInfrastructure>();
  for (const record of records) {
    if (!byType.has(record.provider_type)) byType.set(record.provider_type, record);
  }
  const configOf = (type: string): Record<string, unknown> => asRecord(byType.get(type)?.config);
  const capabilitiesOf = (type: string): Record<string, unknown> => asRecord(byType.get(type)?.capabilities);

  const allTypes = [...byType.keys()];
  const isTextProvider = (type: string): boolean => {
    if (type === 'groq' || type === 'gemini') return true;
    if (type !== 'custom') return false;
    const config = asRecord(byType.get(type)?.config);
    const baseUrl = text(config.base_url) || text(config.baseUrl);
    return Boolean(baseUrl && text(config.api_key));
  };
  const textProviders = allTypes.filter(isTextProvider);

  let kaggleSessionActive = false;
  try {
    const { data } = await animeSupabase
      .from('kaggle_sessions')
      .select('id, status, api_endpoint')
      .eq('user_id', auth.userId)
      .eq('status', 'active')
      .limit(1);
    kaggleSessionActive = Array.isArray(data) && data.length > 0;
  } catch (error) {
    fastify.log.debug({ err: error }, 'Director readiness: kaggle session lookup skipped');
  }

  let channels: Array<{ platform: string; status: string }> = [];
  try {
    const { data } = await animeSupabase
      .from('publish_channels')
      .select('platform, status')
      .eq('user_id', auth.userId);
    if (Array.isArray(data)) {
      channels = data.map((row: Record<string, unknown>) => ({
        platform: text(row.platform).toLowerCase(),
        status: text(row.status).toLowerCase() || 'active',
      }));
    }
  } catch (error) {
    fastify.log.debug({ err: error }, 'Director readiness: publish channel lookup skipped');
  }
  const channelReady = (platform: string): boolean => channels.some(
    (channel) => channel.platform === platform && channel.status === 'active'
  ) || byType.has(platform);

  let databaseMode = 'platform';
  try {
    const { data } = await animeSupabase
      .from('projects')
      .select('id, db_mode')
      .eq('id', projectId)
      .maybeSingle();
    const rawMode = text((data as Record<string, unknown> | null)?.db_mode);
    if (rawMode) databaseMode = rawMode;
  } catch (error) {
    fastify.log.debug({ err: error }, 'Director readiness: db_mode column unavailable');
  }

  const telegramConfig = asRecord(configOf('custom').telegram_storage);
  const githubConfig = asRecord(configOf('custom').github_worker);
  const cpuConfig = asRecord(configOf('custom').cpu_worker);
  const storageChoice = String(configOf('custom').storage_choice || '').toLowerCase();

  const telegramReady = Boolean(
    text(telegramConfig.bot_token) && (text(telegramConfig.chat_id) || text(telegramConfig.owner_chat_id))
  );
  const storageReady = telegramReady || storageChoice === 's3' || byType.has('s3_storage');

  const gpuReady = Boolean(byType.get('kaggle') || byType.get('own_gpu') || kaggleSessionActive);
  const cpuReady = Boolean(
    byType.get('tts') || byType.get('ffmpeg')
    || hasWorkerUrl(configOf('github_actions'))
    || Boolean(text(cpuConfig.worker_url))
  );
  const githubReady = Boolean(
    hasWorkerUrl(configOf('github_actions'))
    || (text(githubConfig.repository) && text(githubConfig.workflow) && text(githubConfig.token))
  );

  const resources: Record<ResourceKey, ResourceReadiness> = {
    database: { status: 'ready', mode: databaseMode },
    ai_text: textProviders.length > 0
      ? { status: 'ready', provider: textProviders[0], model: text(configOf(textProviders[0]).model) || undefined }
      : { status: 'missing', reason: 'No active text provider' },
    ai_vision: (
      byType.has('gemini')
      || textProviders.some((type) => capabilitiesOf(type).vision === true || capabilitiesOf(type).multimodal === true)
    )
      ? { status: 'ready', provider: byType.has('gemini') ? 'gemini' : textProviders[0] }
      : { status: 'missing', reason: 'No vision-capable provider' },
    gpu: gpuReady
      ? { status: 'ready', mode: byType.has('kaggle') || kaggleSessionActive ? 'kaggle' : 'own_gpu' }
      : { status: 'missing', reason: 'No active GPU worker or Kaggle session' },
    cpu: cpuReady
      ? { status: 'ready', mode: byType.has('tts') || byType.has('ffmpeg') ? 'own_cpu' : 'github_actions' }
      : { status: 'missing', reason: 'No CPU worker configured' },
    storage: storageReady
      ? { status: 'ready', mode: telegramReady ? 'telegram' : storageChoice === 's3' ? 's3' : 'custom' }
      : { status: 'missing', reason: 'No storage backend configured' },
    telegram: telegramReady
      ? { status: 'ready', mode: 'telegram' }
      : { status: 'missing', reason: 'Telegram storage is not configured' },
    github: githubReady
      ? { status: 'ready', mode: 'github_actions' }
      : { status: 'missing', reason: 'GitHub dispatch is not configured' },
    youtube: channelReady('youtube')
      ? { status: 'ready', mode: 'oauth' }
      : { status: 'missing', reason: 'YouTube channel not connected' },
    instagram: channelReady('instagram')
      ? { status: 'ready', mode: 'oauth' }
      : { status: 'missing', reason: 'Instagram channel not connected' },
  };

  const blocking: CapabilityBlock[] = [];
  const hintKeys = new Set<ResourceKey>();
  for (const capability of listDirectorCapabilities()) {
    const missing = capability.required_resources.filter((resource) => resources[resource].status === 'missing');
    if (missing.length === 0) continue;
    for (const resource of missing) hintKeys.add(resource);
    blocking.push({
      capability: capability.key,
      label: capability.label,
      missing,
      deep_links: [...new Set([capability.deep_link || 'settings', 'settings'])],
    });
  }

  const setupHints: SetupHint[] = [...hintKeys].map((resource) => ({
    resource,
    message: SETUP_HINTS[resource].message,
    deep_link: SETUP_HINTS[resource].deep_link,
  }));

  const overall: DirectorReadiness['overall'] = blocking.some((block) => block.capability === 'GENERATE_EPISODE')
    || blocking.some((block) => block.capability === 'CONTINUE_EPISODE')
    ? 'blocked'
    : blocking.length > 0
      ? 'degraded'
      : 'ready';

  return {
    project_id: projectId,
    overall,
    checked_at: new Date().toISOString(),
    resources,
    blocking,
    setup_hints: setupHints,
  };
}

export function compactReadiness(readiness: DirectorReadiness): {
  overall: string;
  resources: Record<string, string>;
  setup_needed: string[];
} {
  const resources: Record<string, string> = {};
  for (const [key, value] of Object.entries(readiness.resources)) {
    resources[key] = value.mode ? `${value.status}:${value.mode}` : value.status;
  }
  return {
    overall: readiness.overall,
    resources,
    setup_needed: readiness.setup_hints.map((hint) => hint.resource),
  };
}

export function missingResourcesFor(readiness: DirectorReadiness, intent: string): ResourceKey[] {
  const capability = listDirectorCapabilities().find((item) => item.key === intent);
  if (!capability) return [];
  return capability.required_resources.filter((resource) => readiness.resources[resource].status === 'missing');
}
