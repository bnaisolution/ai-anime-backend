import { COMMAND_INTENT_WF_MAP, CommandIntent, type WorkflowKey } from '../../anime/commands/commands.types';

/**
 * Single source of truth for everything AI Director can propose or execute.
 * Adding a capability here must be enough: prompt catalog, action validation,
 * risk classification, role gate, resource gate, workflow mapping and the
 * Android action cards all derive from this manifest.
 */

export type DirectorActionRisk = 'read_only' | 'low_risk_write' | 'external_side_effect' | 'destructive';

export type ResourceKey =
  | 'database'
  | 'ai_text'
  | 'ai_vision'
  | 'gpu'
  | 'cpu'
  | 'storage'
  | 'telegram'
  | 'github'
  | 'youtube'
  | 'instagram';

export type DirectorRole = 'viewer' | 'reviewer' | 'editor' | 'admin' | 'owner';

export interface DirectorCapability {
  key: string;
  intent: CommandIntent;
  label: string;
  description: string;
  risk: DirectorActionRisk;
  required_role: DirectorRole;
  required_resources: ResourceKey[];
  requires_confirmation: boolean;
  deep_link: string | null;
  workflow: WorkflowKey;
  mode: 'QUICK' | 'SAVE' | null;
  enabled: boolean;
  version: number;
}

export const CAPABILITY_VERSION = '2026-11-18.1';

function humanize(intent: CommandIntent): string {
  return intent.replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

function make(
  intent: CommandIntent,
  input: {
    risk: DirectorActionRisk;
    required_role: DirectorRole;
    required_resources: ResourceKey[];
    description: string;
    deep_link: string | null;
    mode?: 'QUICK' | 'SAVE' | null;
  }
): DirectorCapability {
  return {
    key: intent,
    intent,
    label: humanize(intent),
    description: input.description,
    risk: input.risk,
    required_role: input.required_role,
    required_resources: input.required_resources,
    requires_confirmation: input.risk !== 'read_only',
    deep_link: input.deep_link,
    workflow: COMMAND_INTENT_WF_MAP[intent],
    mode: input.mode ?? null,
    enabled: true,
    version: 1,
  };
}

export const DIRECTOR_CAPABILITIES: readonly DirectorCapability[] = [
  make(CommandIntent.SAVE_BIBLE, {
    risk: 'low_risk_write',
    required_role: 'editor',
    required_resources: ['database', 'ai_text'],
    description: 'Save a new or updated story bible, cast and premise for the project.',
    deep_link: 'bible',
    mode: 'SAVE',
  }),
  make(CommandIntent.GENERATE_EPISODE, {
    risk: 'external_side_effect',
    required_role: 'editor',
    required_resources: ['database', 'ai_text', 'gpu', 'storage'],
    description: 'Generate a full episode: script, scenes, images, clips, voice and final render.',
    deep_link: 'production',
    mode: 'SAVE',
  }),
  make(CommandIntent.REGENERATE_EPISODE, {
    risk: 'destructive',
    required_role: 'editor',
    required_resources: ['database', 'ai_text', 'gpu', 'storage'],
    description: 'Discard existing episode output and regenerate it from the canon.',
    deep_link: 'production',
    mode: 'SAVE',
  }),
  make(CommandIntent.CONTINUE_EPISODE, {
    risk: 'external_side_effect',
    required_role: 'editor',
    required_resources: ['database', 'ai_text', 'gpu', 'storage'],
    description: 'Continue the story with the next episode using the current canon and cast.',
    deep_link: 'production',
    mode: 'SAVE',
  }),
  make(CommandIntent.QUICK_GENERATE_REEL, {
    risk: 'external_side_effect',
    required_role: 'editor',
    required_resources: ['database', 'gpu', 'storage'],
    description: 'Produce a short vertical reel from a prompt or an existing scene.',
    deep_link: 'quick_tools',
    mode: 'QUICK',
  }),
  make(CommandIntent.QUICK_GENERATE_IMAGE, {
    risk: 'external_side_effect',
    required_role: 'editor',
    required_resources: ['database', 'gpu', 'storage'],
    description: 'Generate a single image or character key art.',
    deep_link: 'quick_tools',
    mode: 'QUICK',
  }),
  make(CommandIntent.QUICK_GENERATE_VIDEO, {
    risk: 'external_side_effect',
    required_role: 'editor',
    required_resources: ['database', 'gpu', 'storage'],
    description: 'Generate a short video clip from a prompt or an image.',
    deep_link: 'quick_tools',
    mode: 'QUICK',
  }),
  make(CommandIntent.SAVE_TO_PROJECT, {
    risk: 'low_risk_write',
    required_role: 'editor',
    required_resources: ['database', 'storage'],
    description: 'Attach an existing asset (image, clip, audio) to the project library.',
    deep_link: 'library',
    mode: 'SAVE',
  }),
  make(CommandIntent.VISION_ANALYSIS, {
    risk: 'low_risk_write',
    required_role: 'editor',
    required_resources: ['database', 'ai_vision'],
    description: 'Analyse an image or frame for continuity, character and canon drift.',
    deep_link: 'vision',
    mode: null,
  }),
  make(CommandIntent.CHANGE_CHARACTER_VOICE, {
    risk: 'low_risk_write',
    required_role: 'editor',
    required_resources: ['database', 'cpu', 'storage'],
    description: 'Change the voice assigned to a character for upcoming scenes.',
    deep_link: 'characters',
    mode: 'SAVE',
  }),
  make(CommandIntent.PREVIEW_VOICE, {
    risk: 'low_risk_write',
    required_role: 'editor',
    required_resources: ['cpu', 'storage'],
    description: 'Render a short voice preview before committing a voice change.',
    deep_link: 'characters',
    mode: 'QUICK',
  }),
  make(CommandIntent.LIST_VOICES, {
    risk: 'read_only',
    required_role: 'viewer',
    required_resources: ['database'],
    description: 'List the voice profiles currently available to this project.',
    deep_link: 'characters',
    mode: null,
  }),
  make(CommandIntent.RESET_VOICE, {
    risk: 'low_risk_write',
    required_role: 'editor',
    required_resources: ['database'],
    description: 'Reset a character voice assignment back to the project default.',
    deep_link: 'characters',
    mode: null,
  }),
  make(CommandIntent.RUN_QC, {
    risk: 'low_risk_write',
    required_role: 'editor',
    required_resources: ['database', 'storage'],
    description: 'Run quality control on the target episode and report pass or fail evidence.',
    deep_link: 'qc',
    mode: null,
  }),
  make(CommandIntent.PUBLISH_NOW, {
    risk: 'external_side_effect',
    required_role: 'editor',
    required_resources: ['database', 'storage'],
    description: 'Publish a QC-approved episode to the selected connected channels.',
    deep_link: 'publish',
    mode: 'SAVE',
  }),
  make(CommandIntent.CHECK_CONTINUITY, {
    risk: 'read_only',
    required_role: 'viewer',
    required_resources: ['database', 'ai_text'],
    description: 'Check continuity across the canon, cast and recent episodes.',
    deep_link: 'continuity',
    mode: null,
  }),
  make(CommandIntent.CHECK_CANON, {
    risk: 'read_only',
    required_role: 'viewer',
    required_resources: ['database', 'ai_text'],
    description: 'Check a proposed change against locked canon rules.',
    deep_link: 'canon',
    mode: null,
  }),
  make(CommandIntent.APPROVE_CANON_CHANGE, {
    risk: 'low_risk_write',
    required_role: 'reviewer',
    required_resources: ['database'],
    description: 'Approve a pending canon change request after reviewing its diff.',
    deep_link: 'review_inbox',
    mode: null,
  }),
  make(CommandIntent.REJECT_CANON_CHANGE, {
    risk: 'low_risk_write',
    required_role: 'reviewer',
    required_resources: ['database'],
    description: 'Reject a pending canon change request with a reason.',
    deep_link: 'review_inbox',
    mode: null,
  }),
  make(CommandIntent.RETRY_FAILED, {
    risk: 'low_risk_write',
    required_role: 'editor',
    required_resources: ['database'],
    description: 'Retry the last failed job or workflow step for this project.',
    deep_link: 'jobs',
    mode: null,
  }),
];

const BY_INTENT = new Map<CommandIntent, DirectorCapability>(
  DIRECTOR_CAPABILITIES.map((capability) => [capability.intent, capability])
);

export function listDirectorCapabilities(options?: { includeDisabled?: boolean }): DirectorCapability[] {
  const includeDisabled = options?.includeDisabled === true;
  return DIRECTOR_CAPABILITIES
    .filter((capability) => includeDisabled || capability.enabled)
    .map((capability) => ({ ...capability }));
}

export function getDirectorCapability(intent: string): DirectorCapability | null {
  const key = String(intent || '').trim().toUpperCase() as CommandIntent;
  const capability = BY_INTENT.get(key);
  if (!capability || !capability.enabled) return null;
  return capability;
}

export function isDirectorExecutableIntent(intent: string): boolean {
  return getDirectorCapability(intent) !== null;
}

export function directorActionRisk(intent: string): DirectorActionRisk {
  return getDirectorCapability(intent)?.risk ?? 'low_risk_write';
}

export function requiredResourcesForIntent(intent: string): ResourceKey[] {
  return getDirectorCapability(intent)?.required_resources ?? [];
}

const ROLE_ORDER: DirectorRole[] = ['viewer', 'editor', 'reviewer', 'admin', 'owner'];

export function rolesForIntent(intent: string): DirectorRole[] {
  const capability = getDirectorCapability(intent);
  if (!capability) return [];
  const minimum = ROLE_ORDER.indexOf(capability.required_role);
  return ROLE_ORDER.slice(minimum < 0 ? 0 : minimum);
}

export function roleSatisfiesIntent(intent: string, role: string): boolean {
  const capability = getDirectorCapability(intent);
  if (!capability) return false;
  const minimum = ROLE_ORDER.indexOf(capability.required_role);
  const actual = ROLE_ORDER.indexOf(String(role || '').toLowerCase() as DirectorRole);
  if (minimum < 0) return true;
  return actual >= minimum;
}

export function directorActionPromptCatalog(): string {
  return listDirectorCapabilities()
    .map((capability) => {
      const resources = capability.required_resources.length
        ? capability.required_resources.join(', ')
        : 'none';
      return `- ${capability.key} | risk: ${capability.risk} | min role: ${capability.required_role} | resources: ${resources} | ${capability.description}`;
    })
    .join('\n');
}
