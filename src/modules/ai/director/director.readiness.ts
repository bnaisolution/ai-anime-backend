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
import { flags } from '../../../config/flags';

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

export type OnboardingNextStep =
  | 'byod_setup'
  | 'project_create'
  | 'project_settings'
  | 'story_bible'
  | 'bible_approval'
  | 'characters'
  | 'production';

export interface ProjectSetupSummary {
  exists: boolean;
  settings_complete: boolean;
  missing_settings: string[];
  bible_draft_ready: boolean;
  bible_approved: boolean;
  cast_ready: boolean;
  ready_for_production: boolean;
  next_step: Exclude<OnboardingNextStep, 'byod_setup'>;
  deep_link: string;
}

export interface SetupTrack {
  complete: boolean;
  missing: ResourceKey[];
  configured: Record<string, boolean>;
}

export interface DirectorSetupSummary {
  complete: boolean;
  active_track: 'byod' | 'saas' | null;
  byod: SetupTrack;
  saas: {
    enabled: boolean;
    tenant_configured: boolean;
    complete: boolean;
  };
  project: ProjectSetupSummary | null;
  next_step: OnboardingNextStep;
  deep_link: string;
}

export interface DirectorReadiness {
  project_id: string | null;
  overall: 'ready' | 'degraded' | 'blocked';
  checked_at: string;
  resources: Record<ResourceKey, ResourceReadiness>;
  blocking: CapabilityBlock[];
  setup_hints: SetupHint[];
  setup: DirectorSetupSummary;
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

function positiveNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function evaluateProjectSetup(
  project: Record<string, unknown> | null | undefined,
  options: { castCount: number; bibleVersionCount?: number }
): ProjectSetupSummary | null {
  if (!project) return null;
  const bible = asRecord(project.story_bible);
  const name = text(project.name);
  const genre = text(project.genre) || text(bible.genre);
  const visualMedium = text(project.visual_medium) || text(bible.visual_medium) || text(project.visual_style);
  const totalSeasons = positiveNumber(bible.total_seasons);
  const episodesPerSeason = positiveNumber(bible.episodes_per_season) || positiveNumber(bible.target_episode_count);
  const episodeDurationMin = positiveNumber(bible.episode_duration_min);

  const missingSettings: string[] = [];
  if (!name) missingSettings.push('name');
  if (!genre) missingSettings.push('genre');
  if (!visualMedium) missingSettings.push('visual_medium');
  if (!totalSeasons) missingSettings.push('total_seasons');
  if (!episodesPerSeason) missingSettings.push('episodes_per_season');
  if (!episodeDurationMin) missingSettings.push('episode_duration_min');

  const settingsComplete = missingSettings.length === 0;
  const bibleDraftReady = Boolean(
    text(bible.title) || text(bible.logline) || text(bible.world_overview) || text(bible.premise)
  );
  const bibleApproved = Boolean(text(bible.bible_approved_at))
    || Number(options.bibleVersionCount || 0) > 0;
  const castReady = Number(options.castCount || 0) > 0;
  const readyForProduction = settingsComplete && bibleDraftReady && bibleApproved && castReady;

  let nextStep: ProjectSetupSummary['next_step'] = 'production';
  let deepLink = 'production';
  if (!settingsComplete) {
    nextStep = 'project_settings';
    deepLink = 'project_detail';
  } else if (!bibleDraftReady) {
    nextStep = 'story_bible';
    deepLink = 'bible';
  } else if (!bibleApproved) {
    nextStep = 'bible_approval';
    deepLink = 'bible';
  } else if (!castReady) {
    nextStep = 'characters';
    deepLink = 'characters';
  }

  return {
    exists: true,
    settings_complete: settingsComplete,
    missing_settings: missingSettings,
    bible_draft_ready: bibleDraftReady,
    bible_approved: bibleApproved,
    cast_ready: castReady,
    ready_for_production: readyForProduction,
    next_step: nextStep,
    deep_link: deepLink,
  };
}

export async function buildDirectorReadiness(
  fastify: FastifyInstance,
  auth: AuthContext,
  projectId?: string | null
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
  const allConfigs = records.map((record) => asRecord(record.config));
  const valueOf = (key: string): unknown => {
    for (const config of allConfigs) {
      if (config[key] !== undefined) return config[key];
    }
    return undefined;
  };
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

  let databaseReady = true;
  let databaseReason: string | undefined;
  try {
    const { error } = await animeSupabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', auth.userId)
      .limit(1);
    if (error) {
      databaseReady = false;
      databaseReason = error.message;
    }
  } catch (error) {
    databaseReady = false;
    databaseReason = error instanceof Error ? error.message : 'Database health check failed';
  }

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

  const projectIdValue = typeof projectId === 'string' && projectId.trim() ? projectId.trim() : null;
  let databaseMode = 'platform';
  let projectRow: Record<string, unknown> | null = null;
  if (projectIdValue) {
    try {
      const { data } = await animeSupabase
        .from('projects')
        .select('id, name, genre, visual_medium, visual_style, story_bible, db_mode')
        .eq('id', projectIdValue)
        .maybeSingle();
      projectRow = (data as Record<string, unknown> | null) || null;
      const rawMode = text(projectRow?.db_mode);
      if (rawMode) databaseMode = rawMode;
    } catch (error) {
      fastify.log.debug({ err: error }, 'Director readiness: project mode lookup unavailable');
    }
  }

  const gpuRouting = asRecord(valueOf('gpu_routing'));
  const customGpu = asRecord(gpuRouting.custom_gpu);
  const customGpuReady = Boolean(
    (customGpu.enabled === true || text(customGpu.worker_url))
    && hasWorkerUrl(customGpu)
  );
  const telegramConfig = asRecord(valueOf('telegram_storage'));
  const githubConfig = asRecord(valueOf('github_worker'));
  const cpuConfig = asRecord(valueOf('cpu_worker'));
  const storageChoice = String(valueOf('storage_choice') || '').toLowerCase();

  const telegramReady = Boolean(
    text(telegramConfig.bot_token)
    && (text(telegramConfig.chat_id) || text(telegramConfig.storage_chat_id) || text(telegramConfig.owner_chat_id))
  );
  const s3Config = asRecord(valueOf('s3_storage'));
  const s3Ready = storageChoice === 's3' && Boolean(
    text(s3Config.bucket) && (text(s3Config.access_key) || text(s3Config.access_key_id))
  );
  const storageReady = telegramReady || s3Ready || byType.has('s3_storage');

  const gpuReady = Boolean(
    byType.get('kaggle') || byType.get('own_gpu') || kaggleSessionActive || customGpuReady
  );
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
    database: databaseReady
      ? { status: 'ready', mode: databaseMode }
      : { status: 'missing', reason: databaseReason || 'Database health check failed' },
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
      ? {
        status: 'ready',
        mode: customGpuReady
          ? 'own_gpu'
          : byType.has('kaggle') || kaggleSessionActive
            ? 'kaggle'
            : 'own_gpu',
      }
      : { status: 'missing', reason: 'No active GPU worker or Kaggle session' },
    cpu: cpuReady
      ? { status: 'ready', mode: byType.has('tts') || byType.has('ffmpeg') ? 'own_cpu' : 'github_actions' }
      : { status: 'missing', reason: 'No CPU worker configured' },
    storage: storageReady
      ? { status: 'ready', mode: telegramReady ? 'telegram' : s3Ready || byType.has('s3_storage') ? 's3' : 'custom' }
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

  let castCount = 0;
  let bibleVersionCount = 0;
  if (projectIdValue) {
    try {
      const { count } = await animeSupabase
        .from('characters')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectIdValue);
      castCount = Number(count || 0);
    } catch (error) {
      fastify.log.debug({ err: error }, 'Director readiness: cast count unavailable');
    }
    try {
      const { count } = await animeSupabase
        .from('bible_versions')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectIdValue);
      bibleVersionCount = Number(count || 0);
    } catch (error) {
      fastify.log.debug({ err: error }, 'Director readiness: bible version count unavailable');
    }
  }

  let tenantConfigured = false;
  try {
    const { data } = await animeSupabase
      .from('anime_tenant_members')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('status', 'active')
      .limit(1);
    tenantConfigured = Array.isArray(data) && data.length > 0;
  } catch (error) {
    fastify.log.debug({ err: error }, 'Director readiness: tenant membership unavailable');
  }

  const coreSetupResources: ResourceKey[] = ['database', 'ai_text', 'gpu', 'storage'];
  const byodMissing = coreSetupResources.filter((resource) => resources[resource].status === 'missing');
  const byod: SetupTrack = {
    complete: byodMissing.length === 0,
    missing: byodMissing,
    configured: {
      database: resources.database.status !== 'missing',
      ai_text: resources.ai_text.status !== 'missing',
      gpu: resources.gpu.status !== 'missing',
      storage: resources.storage.status !== 'missing',
    },
  };
  const saas = {
    enabled: flags.saasBilling,
    tenant_configured: tenantConfigured,
    complete: flags.saasBilling && tenantConfigured && resources.ai_text.status !== 'missing',
  };
  const activeTrack: DirectorSetupSummary['active_track'] = byod.complete
    ? 'byod'
    : saas.complete
      ? 'saas'
      : null;
  const project = evaluateProjectSetup(projectRow, { castCount, bibleVersionCount });
  const setupComplete = Boolean(activeTrack);
  const setupNextStep: OnboardingNextStep = !setupComplete
    ? 'byod_setup'
    : project
      ? project.next_step
      : 'project_create';
  const setupDeepLink = setupNextStep === 'byod_setup'
    ? 'settings'
    : setupNextStep === 'project_create'
      ? 'projects'
      : (project?.deep_link || 'settings');
  const setup: DirectorSetupSummary = {
    complete: setupComplete,
    active_track: activeTrack,
    byod,
    saas,
    project,
    next_step: setupNextStep,
    deep_link: setupDeepLink,
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

  const productionBlocked = blocking.some((block) => block.capability === 'GENERATE_EPISODE')
    || blocking.some((block) => block.capability === 'CONTINUE_EPISODE');
  const setupBlocked = project
    ? !project.ready_for_production
    : !setupComplete;
  const overall: DirectorReadiness['overall'] = productionBlocked || setupBlocked
    ? 'blocked'
    : blocking.length > 0
      ? 'degraded'
      : 'ready';

  return {
    project_id: projectIdValue,
    overall,
    checked_at: new Date().toISOString(),
    resources,
    blocking,
    setup_hints: setupHints,
    setup,
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
