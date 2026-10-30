export enum CommandIntent {
  CREATE_PROJECT = 'CREATE_PROJECT',
  OPEN_PROJECT = 'OPEN_PROJECT',
  SAVE_BIBLE = 'SAVE_BIBLE',
  BIBLE_CHAT = 'BIBLE_CHAT',
  QUICK_GENERATE_REEL = 'QUICK_GENERATE_REEL',
  GENERATE_EPISODE = 'GENERATE_EPISODE',
  REGENERATE_EPISODE = 'REGENERATE_EPISODE',
  CONTINUE_EPISODE = 'CONTINUE_EPISODE',
  QUICK_GENERATE_IMAGE = 'QUICK_GENERATE_IMAGE',
  QUICK_GENERATE_VIDEO = 'QUICK_GENERATE_VIDEO',
  SAVE_TO_PROJECT = 'SAVE_TO_PROJECT',
  VISION_ANALYSIS = 'VISION_ANALYSIS',
  CHANGE_CHARACTER_VOICE = 'CHANGE_CHARACTER_VOICE',
  PREVIEW_VOICE = 'PREVIEW_VOICE',
  LIST_VOICES = 'LIST_VOICES',
  RESET_VOICE = 'RESET_VOICE',
  CHECK_CANON = 'CHECK_CANON',
  VIEW_CANON = 'VIEW_CANON',
  APPROVE_CANON_CHANGE = 'APPROVE_CANON_CHANGE',
  REJECT_CANON_CHANGE = 'REJECT_CANON_CHANGE',
  CHECK_CONTINUITY = 'CHECK_CONTINUITY',
  CHECK_QUOTA = 'CHECK_QUOTA',
  RETRY_FAILED = 'RETRY_FAILED',
  VIEW_STATE = 'VIEW_STATE',
  VIEW_AUDIT = 'VIEW_AUDIT',
  RUN_QC = 'RUN_QC',
  PUBLISH_NOW = 'PUBLISH_NOW',
  VIEW_ANALYTICS = 'VIEW_ANALYTICS',
  ADMIN_START_KAGGLE = 'ADMIN_START_KAGGLE',
  ADMIN_STOP_KAGGLE = 'ADMIN_STOP_KAGGLE',
  ADMIN_STATUS = 'ADMIN_STATUS',
  DB_TEST = 'DB_TEST',
  SYSTEM_HEALTH = 'SYSTEM_HEALTH',
}

export type WorkflowKey =
  | 'WF-00'
  | 'WF-01'
  | 'WF-02'
  | 'WF-03'
  | 'WF-04'
  | 'WF-05'
  | 'WF-06'
  | 'WF-07'
  | 'WF-08'
  | 'WF-09'
  | 'WF-10'
  | 'WF-11'
  | 'WF-12'
  | 'WF-13';

export const COMMAND_INTENT_WF_MAP: Readonly<Record<CommandIntent, WorkflowKey>> = {
  [CommandIntent.CREATE_PROJECT]: 'WF-01',
  [CommandIntent.OPEN_PROJECT]: 'WF-01',
  [CommandIntent.SAVE_BIBLE]: 'WF-01',
  [CommandIntent.BIBLE_CHAT]: 'WF-01',
  [CommandIntent.QUICK_GENERATE_REEL]: 'WF-02',
  [CommandIntent.GENERATE_EPISODE]: 'WF-02',
  [CommandIntent.REGENERATE_EPISODE]: 'WF-02',
  [CommandIntent.CONTINUE_EPISODE]: 'WF-02',
  [CommandIntent.QUICK_GENERATE_IMAGE]: 'WF-03',
  [CommandIntent.QUICK_GENERATE_VIDEO]: 'WF-03',
  [CommandIntent.SAVE_TO_PROJECT]: 'WF-03',
  [CommandIntent.CHANGE_CHARACTER_VOICE]: 'WF-04',
  [CommandIntent.PREVIEW_VOICE]: 'WF-04',
  [CommandIntent.LIST_VOICES]: 'WF-04',
  [CommandIntent.RESET_VOICE]: 'WF-04',
  [CommandIntent.VIEW_STATE]: 'WF-04',
  [CommandIntent.VIEW_AUDIT]: 'WF-04',
  [CommandIntent.ADMIN_START_KAGGLE]: 'WF-04',
  [CommandIntent.ADMIN_STOP_KAGGLE]: 'WF-04',
  [CommandIntent.ADMIN_STATUS]: 'WF-04',
  [CommandIntent.DB_TEST]: 'WF-04',
  [CommandIntent.SYSTEM_HEALTH]: 'WF-04',
  [CommandIntent.VISION_ANALYSIS]: 'WF-05',
  [CommandIntent.CHECK_CONTINUITY]: 'WF-06',
  [CommandIntent.PUBLISH_NOW]: 'WF-07',
  [CommandIntent.VIEW_ANALYTICS]: 'WF-08',
  [CommandIntent.CHECK_CANON]: 'WF-09',
  [CommandIntent.VIEW_CANON]: 'WF-09',
  [CommandIntent.APPROVE_CANON_CHANGE]: 'WF-09',
  [CommandIntent.REJECT_CANON_CHANGE]: 'WF-09',
  [CommandIntent.RUN_QC]: 'WF-11',
  [CommandIntent.CHECK_QUOTA]: 'WF-12',
  [CommandIntent.RETRY_FAILED]: 'WF-13',
};

export enum CommandStatus {
  QUEUED = 'QUEUED',
  ACCEPTED = 'ACCEPTED',
  PERSISTED = 'PERSISTED',
  DISPATCH_PENDING = 'DISPATCH_PENDING',
  DISPATCHED = 'DISPATCHED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RECONCILING = 'RECONCILING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  DEFERRED = 'DEFERRED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}

export type ExecutionMode = 'QUICK' | 'SAVE';
export type VisualStyle = 'ANIME' | 'REALISTIC';

export interface ProjectStyleConfig {
  readonly visual_style: VisualStyle;
}

export interface UserInfrastructureConfig {
  readonly groq?: { readonly api_key?: string };
  readonly gemini?: { readonly api_key?: string };
  readonly openai?: { readonly api_key?: string };
  readonly kaggle?: { readonly worker_url?: string };
  readonly ffmpeg?: { readonly worker_url?: string };
  readonly telegram?: { readonly bot_token?: string; readonly channel_id?: string };
  readonly youtube?: {
    readonly client_id?: string;
    readonly client_secret?: string;
    readonly refresh_token?: string;
    readonly access_token?: string;
    readonly upload_bridge_url?: string;
  };
  readonly instagram?: {
    readonly ig_user_id?: string;
    readonly access_token?: string;
  };
}

export interface ApiCommandRecord {
  readonly id: string;
  readonly project_id: string;
  readonly user_id: string;
  readonly intent: CommandIntent;
  readonly payload: Record<string, unknown>;
  readonly status: CommandStatus;
  readonly idempotency_key: string;
  readonly body_hash: string;
  readonly created_at: string;
}
