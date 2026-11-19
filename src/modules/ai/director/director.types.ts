import type { CommandIntent } from '../../anime/commands/commands.types';
import type { DirectorActionProposal } from './director.actions';
import type { TargetSelection } from './director.duration';
import type { DirectorSetupSummary } from './director.readiness';

export interface DirectorProjectSummary {
  id: string;
  name: string;
  genre: string | null;
  format: string | null;
  language: string;
  visual_style: string | null;
  phase: string;
  current_season: number;
  current_episode: number;
  canon_version: number;
  continuity_version: number;
}

export interface DirectorTargetSummary extends TargetSelection {
  actual_runtime_sec: number;
  runtime_clip_count: number;
  runtime_missing_count: number;
  duration_status: 'under' | 'on_target' | 'over' | 'unknown';
  duration_delta_sec: number;
}

export interface DirectorContext {
  context_version: string;
  project: DirectorProjectSummary;
  setup: DirectorSetupSummary;
  access: {
    role: string;
    can_edit: boolean;
    can_review: boolean;
    can_publish: boolean;
    can_manage_settings: boolean;
  };
  target: DirectorTargetSummary;
  bible: Record<string, unknown>;
  cast: Array<{ name: string; status: string | null; age_group: string | null }>;
  memory: {
    knowledge: Array<{ memory_type: string | null; content: string | null }>;
    story: Array<{ level: string | null; key: string | null; importance: string | null; value: unknown }>;
  };
  episode: {
    episode_no: number;
    season_no: number;
    state: string;
    qc_status: string;
    approval_status: string;
    scene_count: number;
    summary: string | null;
  } | null;
  recent_episodes: Array<{ episode_no: number; season_no: number; state: string; qc_status: string }>;
  pending_actions: number;
  failed_jobs: number;
  resources: {
    byod_provider_count: number;
    active_provider_types: string[];
    gpu_worker_configured: boolean;
    cpu_worker_configured: boolean;
    telegram_configured: boolean;
    storage_ready: boolean;
    youtube_connected: boolean;
    instagram_connected: boolean;
    github_dispatch_configured: boolean;
    readiness: {
      overall: string;
      resources: Record<string, string>;
      setup_needed: string[];
    } | null;
  };
  quota: {
    rpm_used: number;
    rpm_limit: number;
    rpd_used: number;
    rpd_limit: number;
  };
  recent_commands: Array<{ intent: string; status: string; created_at: string | null }>;
  workflow_ids_visible: boolean;
}

export interface DirectorChatResult {
  request_id: string;
  conversation_id: string | null;
  status: 'completed';
  reply: string;
  message: string;
  provider: string;
  model: string;
  key_source: string;
  context: DirectorContext | null;
  actions: DirectorActionProposal[];
  verification: { status: 'verified' | 'not_verified'; evidence: string[] };
}

export interface DirectorActionExecution {
  action_id: string;
  intent: CommandIntent;
  command_id: string;
  status: string;
  idempotent_replay: boolean;
}
