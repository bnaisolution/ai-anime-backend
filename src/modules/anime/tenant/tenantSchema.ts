export const TENANT_SCHEMA_VERSION = 2;

export const TENANT_DATA_TABLES = [
  "projects",
  "episodes",
  "episode_states",
  "scenes",
  "clips",
  "characters",
  "character_status",
  "character_status_history",
  "character_arcs",
  "character_reference_history",
  "character_knowledge",
  "character_relationships",
  "power_system",
  "locations",
  "artifacts",
  "story_rules",
  "story_timeline",
  "story_state_snapshots",
  "canon_facts",
  "bible_versions",
  "mystery_tracker",
  "scene_library",
  "motion_library",
  "quota_usage",
  "pending_actions",
  "episode_analytics",
  "project_analytics_insights",
  "audio_usage_log",
  "published_content",
  "audit_log"
] as const;

export const TENANT_PROJECT_TABLES = new Set<string>(TENANT_DATA_TABLES);

export const TENANT_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS anime_data;

CREATE TABLE IF NOT EXISTS anime_data.schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.projects (
  id uuid NOT NULL,
  user_id text,
  name text,
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT false,
  story_bible jsonb DEFAULT '{}'::jsonb,
  current_season integer DEFAULT 1,
  current_episode integer DEFAULT 0,
  continuity_version integer DEFAULT 1,
  season_arc jsonb DEFAULT '{}'::jsonb,
  bible_diff_log jsonb DEFAULT '[]'::jsonb,
  description text,
  genre text,
  language text DEFAULT 'hi',
  updated_at timestamptz DEFAULT now(),
  universe_id text,
  canon_version integer DEFAULT 1,
  auto_approve boolean DEFAULT false,
  budget_ceiling numeric,
  visual_style text DEFAULT 'ANIME',
  style_profile_id uuid,
  visual_medium text DEFAULT 'ANIME',
  active_system_prompt_id uuid,
  tenant_id uuid
);
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS story_bible jsonb DEFAULT '{}'::jsonb;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS current_season integer DEFAULT 1;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS current_episode integer DEFAULT 0;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS continuity_version integer DEFAULT 1;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS season_arc jsonb DEFAULT '{}'::jsonb;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS bible_diff_log jsonb DEFAULT '[]'::jsonb;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS genre text;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS language text DEFAULT 'hi';
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS universe_id text;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS canon_version integer DEFAULT 1;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS auto_approve boolean DEFAULT false;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS budget_ceiling numeric;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS visual_style text DEFAULT 'ANIME';
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS style_profile_id uuid;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS visual_medium text DEFAULT 'ANIME';
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS active_system_prompt_id uuid;
ALTER TABLE anime_data.projects ADD COLUMN IF NOT EXISTS tenant_id uuid;

CREATE TABLE IF NOT EXISTS anime_data.episodes (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    episode_no integer NOT NULL,
    title text,
    script text,
    created_at timestamp with time zone DEFAULT now(),
    season_no integer DEFAULT 1,
    continuity_memory jsonb DEFAULT '{"injuries": [], "power_ups": [], "recap_note": "", "clues_revealed": []}'::jsonb,
    output_media jsonb DEFAULT '{"thumbnail_url": "", "full_audio_url": "", "final_video_url": ""}'::jsonb,
    summary_200w text,
    telegram_file_id text,
    season_script_ref uuid,
    word_count integer DEFAULT 0,
    scene_count integer DEFAULT 0,
    motion_reuse_count integer DEFAULT 0,
    scene_reuse_count integer DEFAULT 0,
    gpu_scenes_count integer DEFAULT 0,
    cpu_scenes_count integer DEFAULT 0,
    bgm_theme text,
    bgm_crossfade_ms integer DEFAULT 2000,
    current_state text DEFAULT 'SCRIPT_DRAFT'::text,
    state_history jsonb DEFAULT '[]'::jsonb,
    snapshot_id uuid,
    continuity_status text DEFAULT 'PENDING'::text,
    qc_status text DEFAULT 'PENDING'::text,
    approval_status text DEFAULT 'PENDING'::text,
    youtube_url text,
    instagram_urls jsonb,
    published_at timestamp with time zone,
    parallel_status jsonb DEFAULT '{}'::jsonb,
    recap_note text,
    beat_count integer DEFAULT 0,
    target_duration_sec integer,
    script_json jsonb,
    telegram_url text
);

CREATE TABLE IF NOT EXISTS anime_data.episode_states (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    episode_no integer NOT NULL,
    current_state text DEFAULT 'SCRIPT_DRAFT'::text,
    state_history jsonb DEFAULT '[]'::jsonb,
    failure_reason text,
    retry_count integer DEFAULT 0,
    last_state_change_at timestamp with time zone DEFAULT now(),
    episode_id uuid,
    idempotency_key text,
    is_locked boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    parallel_status jsonb DEFAULT '{}'::jsonb,
    current_batch text
);

CREATE TABLE IF NOT EXISTS anime_data.scenes (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    episode_id uuid,
    category text,
    description text,
    image_url text,
    created_at timestamp with time zone DEFAULT now(),
    scene_order integer,
    needs_image boolean DEFAULT true,
    needs_voice boolean DEFAULT true,
    needs_lipsync boolean DEFAULT false,
    needs_motion boolean DEFAULT false,
    needs_expression boolean DEFAULT false,
    needs_camera_motion boolean DEFAULT true,
    needs_subtitles boolean DEFAULT true,
    needs_bgm boolean DEFAULT true,
    needs_sfx boolean DEFAULT false,
    mouth_visible boolean DEFAULT false,
    dialogue_speaker_id text,
    camera_motion_type text DEFAULT 'KEN_BURNS'::text,
    routing text DEFAULT 'KEN_BURNS'::text,
    gpu_priority text DEFAULT 'P1'::text,
    gpu_required boolean DEFAULT false,
    routing_reason text,
    scene_id text,
    episode_no integer,
    visual_prompt text,
    status text
);

CREATE TABLE IF NOT EXISTS anime_data.clips (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    category text,
    description text,
    video_url text,
    created_at timestamp with time zone DEFAULT now(),
    episode_no integer,
    scene_type text DEFAULT 'narration_wide'::text,
    voice_text text,
    image_url text,
    audio_url text,
    scene_order integer DEFAULT 1,
    status text DEFAULT 'pending'::text,
    character_id uuid,
    audio_mix_config jsonb DEFAULT '{"sfx_type": "", "bgm_track": "dark_cinematic", "bgm_volume": 0.35, "sfx_delay_ms": 0, "ducking_enabled": true}'::jsonb,
    routing_hint text DEFAULT 'KENBURNS'::text,
    motion_key text,
    reuse_key text,
    image_file_id text,
    age_group text,
    transition_hint text DEFAULT 'hard_cut'::text,
    subtitle_text text,
    voice_modifiers jsonb DEFAULT '{}'::jsonb,
    bgm_hint jsonb DEFAULT '{}'::jsonb,
    sfx_hints jsonb DEFAULT '[]'::jsonb,
    voice_id text,
    checkpoint_stage text,
    retry_count integer DEFAULT 0,
    last_error text,
    qc_status text DEFAULT 'PENDING'::text,
    episode_id uuid,
    needs_lipsync boolean DEFAULT false,
    needs_motion boolean DEFAULT false,
    image_ready_at timestamp with time zone,
    video_ready_at timestamp with time zone,
    processed_by text,
    batch_id text,
    output_file_id text,
    needs_camera_motion boolean DEFAULT false,
    camera_motion_type text DEFAULT 'NONE'::text,
    mouth_visible boolean DEFAULT false,
    dialogue_speaker_id text,
    gpu_priority text DEFAULT 'P0'::text,
    gpu_required boolean DEFAULT false,
    routing_reason text,
    character_code text,
    needs_image boolean DEFAULT false,
    needs_voice boolean DEFAULT false,
    needs_expression boolean DEFAULT false,
    needs_subtitles boolean DEFAULT false,
    needs_bgm boolean DEFAULT false,
    needs_sfx boolean DEFAULT false,
    routing text,
    voice_config jsonb,
    emotion text DEFAULT 'neutral'::text
);

CREATE TABLE IF NOT EXISTS anime_data.characters (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    name text NOT NULL,
    description text,
    image_url text,
    created_at timestamp with time zone DEFAULT now(),
    character_code text,
    visual_dna jsonb DEFAULT '{"age": "", "body": "", "face": "", "hair": "", "scar": "", "weapon": "", "clothing": "", "color_palette": "", "negative_prompt": "deformed, extra limbs, ugly, bad anatomy, modern clothes"}'::jsonb,
    voice_config jsonb DEFAULT '{"rate": "+0%", "pitch": "-2Hz", "provider": "Edge TTS", "voice_id": "hi-IN-MadhurNeural"}'::jsonb,
    powers_and_lore jsonb DEFAULT '{"powers": [], "inventory": [], "relationships": []}'::jsonb,
    initial_status text DEFAULT 'alive'::text,
    age_group text DEFAULT 'adult'::text,
    image_file_id text,
    canon_lock_status text DEFAULT 'CHANGEABLE'::text,
    current_snapshot_id uuid,
    universe_id text,
    locked_fields jsonb DEFAULT '[]'::jsonb,
    source text,
    validation_status text DEFAULT 'pending'::text,
    reference_version integer DEFAULT 1
);

CREATE TABLE IF NOT EXISTS anime_data.character_status (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    character_id uuid,
    character_code text,
    status text DEFAULT 'alive'::text,
    status_changed_ep integer DEFAULT 0,
    status_reason text,
    location text,
    injuries jsonb DEFAULT '[]'::jsonb,
    emotional_state jsonb DEFAULT '{}'::jsonb,
    current_goal text,
    power_level integer DEFAULT 1,
    revival_planned boolean DEFAULT false,
    revival_planned_ep integer,
    revival_conditions jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.character_status_history (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    character_id uuid,
    character_code text,
    episode_no integer NOT NULL,
    old_status text,
    new_status text,
    reason text,
    event_id uuid,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.character_arcs (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    character_code text,
    arc_name text,
    arc_type text DEFAULT 'redemption'::text,
    start_ep integer DEFAULT 0,
    planned_end_ep integer,
    current_stage text DEFAULT 'beginning'::text,
    stages jsonb DEFAULT '[]'::jsonb,
    flaw text,
    goal text,
    internal_conflict text,
    turning_points jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.character_reference_history (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    character_code text NOT NULL,
    episode_no integer,
    image_file_id text,
    visual_dna jsonb,
    age_group text,
    change_reason text,
    created_at timestamp with time zone DEFAULT now(),
    reference_version integer DEFAULT 1,
    valid_from_episode integer DEFAULT 0,
    valid_to_episode integer,
    reason text
);

CREATE TABLE IF NOT EXISTS anime_data.character_knowledge (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    character_id uuid,
    character_code text,
    knowledge_key text,
    knowledge_value text,
    knows boolean DEFAULT true,
    learned_at_ep integer,
    confidence double precision DEFAULT 1.0,
    secret boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    fact_id uuid
);

CREATE TABLE IF NOT EXISTS anime_data.character_relationships (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    char_a_code text,
    char_b_code text,
    relationship_type text,
    relationship_status text DEFAULT 'neutral'::text,
    trust_level integer DEFAULT 50,
    strength integer DEFAULT 50,
    start_ep integer DEFAULT 0,
    end_ep integer,
    secret_info jsonb DEFAULT '{}'::jsonb,
    what_a_knows jsonb DEFAULT '[]'::jsonb,
    what_b_knows jsonb DEFAULT '[]'::jsonb,
    history jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    trust_delta integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS anime_data.power_system (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    character_code text,
    power_name text,
    power_level integer DEFAULT 1,
    max_level integer DEFAULT 10,
    source text,
    abilities jsonb DEFAULT '[]'::jsonb,
    limitations jsonb DEFAULT '[]'::jsonb,
    cost text,
    weakness text,
    counter text,
    unlock_condition text,
    upgrade_path text,
    current_status text DEFAULT 'locked'::text,
    first_unlock_ep integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.locations (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    location_code text,
    name text NOT NULL,
    parent_world text,
    location_type text,
    description text,
    history text,
    geography text,
    climate text,
    political_control text,
    landmarks jsonb DEFAULT '[]'::jsonb,
    rules jsonb DEFAULT '[]'::jsonb,
    danger_level integer DEFAULT 1,
    visual_description text,
    reference_image_url text,
    first_appearance_ep integer,
    last_appearance_ep integer,
    current_status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.artifacts (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    artifact_code text,
    name text NOT NULL,
    artifact_type text,
    origin text,
    history text,
    powers jsonb DEFAULT '[]'::jsonb,
    limitations jsonb DEFAULT '[]'::jsonb,
    weakness text,
    current_owner_code text,
    current_location text,
    first_appearance_ep integer,
    current_status text DEFAULT 'active'::text,
    visual_reference text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.story_rules (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    rule_code text,
    rule_text text NOT NULL,
    rule_type text DEFAULT 'global'::text,
    priority text DEFAULT 'high'::text,
    tags jsonb DEFAULT '[]'::jsonb,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.story_timeline (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    event_date text,
    event_era text,
    episode_no integer,
    location text,
    event_description text,
    characters_involved jsonb DEFAULT '[]'::jsonb,
    before_events jsonb DEFAULT '[]'::jsonb,
    after_events jsonb DEFAULT '[]'::jsonb,
    time_elapsed text,
    importance text DEFAULT 'medium'::text,
    created_at timestamp with time zone DEFAULT now(),
    season_no integer DEFAULT 1,
    consequences text,
    event_code text
);

CREATE TABLE IF NOT EXISTS anime_data.story_state_snapshots (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    universe_id text,
    season_id integer,
    episode_id integer,
    snapshot_version integer DEFAULT 1,
    snapshot_data jsonb NOT NULL,
    canon_version integer,
    timeline_version integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.canon_facts (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    universe_id text,
    fact_type text NOT NULL,
    entity_type text,
    entity_id text,
    fact_key text NOT NULL,
    fact_value jsonb,
    canon_status text DEFAULT 'CHANGEABLE'::text,
    version integer DEFAULT 1,
    locked_at timestamp with time zone,
    locked_by text,
    approved_by text,
    approved_at timestamp with time zone,
    affected_episodes jsonb DEFAULT '[]'::jsonb,
    affected_characters jsonb DEFAULT '[]'::jsonb,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.bible_versions (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    season_no integer,
    episode_no integer,
    bible_snapshot jsonb,
    character_snapshot jsonb,
    change_summary text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.mystery_tracker (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    mystery_id text NOT NULL,
    created_episode integer,
    description text,
    importance text,
    characters_aware jsonb DEFAULT '[]'::jsonb,
    clues jsonb DEFAULT '[]'::jsonb,
    red_herrings jsonb DEFAULT '[]'::jsonb,
    foreshadowing jsonb DEFAULT '[]'::jsonb,
    planned_reveal_episode integer,
    actual_reveal_episode integer,
    status text DEFAULT 'OPEN'::text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.scene_library (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    reuse_key text NOT NULL,
    scene_type text,
    image_file_id text,
    image_url text,
    location_code text,
    usage_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.motion_library (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    motion_key text NOT NULL,
    age_group text,
    motion_type text,
    video_file_id text,
    video_url text,
    duration integer,
    usage_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.quota_usage (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    usage_date date NOT NULL,
    service_type text NOT NULL,
    accumulated_units numeric DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.pending_actions (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    session_id text,
    action_type text,
    action_payload jsonb,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval),
    assigned_to text,
    batch_id text,
    priority integer DEFAULT 0,
    ready_at timestamp with time zone,
    stage text,
    job_id text,
    idempotency_key text,
    lease_until timestamp with time zone,
    claimed_at timestamp with time zone,
    last_error text,
    mode text DEFAULT 'SAVE'::text,
    review_type text,
    retry_count integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.episode_analytics (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    episode_no integer,
    platform text,
    views integer DEFAULT 0,
    watch_time_seconds integer DEFAULT 0,
    avg_view_duration integer DEFAULT 0,
    ctr numeric(5,2),
    likes integer DEFAULT 0,
    comments integer DEFAULT 0,
    shares integer DEFAULT 0,
    saves integer DEFAULT 0,
    revenue numeric(10,2) DEFAULT 0,
    fetched_at timestamp with time zone DEFAULT now(),
    engagement_score numeric
);

CREATE TABLE IF NOT EXISTS anime_data.project_analytics_insights (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    episode_no integer,
    sentiment text,
    top_performing_elements jsonb,
    drop_off_diagnostics text,
    script_optimization_tips jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.audio_usage_log (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    episode_no integer,
    clip_id uuid,
    audio_type text,
    audio_id uuid,
    volume numeric(3,2),
    start_ms integer,
    end_ms integer,
    created_at timestamp with time zone DEFAULT now(),
    resolved_code text,
    resolved_url text,
    fallback_tier text,
    requested_hint jsonb
);

CREATE TABLE IF NOT EXISTS anime_data.published_content (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    episode_no integer,
    platform text,
    platform_content_id text,
    platform_url text,
    title text,
    description text,
    thumbnail_file_id text,
    published_at timestamp with time zone,
    status text DEFAULT 'scheduled'::text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anime_data.audit_log (

    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    user_id text,
    episode_no integer,
    workflow_name text,
    action text,
    entity_type text,
    entity_id text,
    previous_value jsonb,
    new_value jsonb,
    ai_model text,
    prompt_version text,
    reason text,
    approval_status text,
    execution_id text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE anime_data.episodes ADD COLUMN IF NOT EXISTS synopsis text;
ALTER TABLE anime_data.episodes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE anime_data.episodes ADD COLUMN IF NOT EXISTS target_duration_sec integer;
ALTER TABLE anime_data.episode_states ADD COLUMN IF NOT EXISTS season_no integer NOT NULL DEFAULT 1;
ALTER TABLE anime_data.scenes ADD COLUMN IF NOT EXISTS season_no integer NOT NULL DEFAULT 1;
ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS season_no integer NOT NULL DEFAULT 1;
ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS tg_image_file_id text;
ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS tg_audio_file_id text;
ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS tg_video_file_id text;
ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS clip_url text;
ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS duration_sec numeric;
ALTER TABLE anime_data.scenes ADD COLUMN IF NOT EXISTS shot_manifest jsonb DEFAULT '[]'::jsonb;
ALTER TABLE anime_data.scenes ADD COLUMN IF NOT EXISTS camera_json jsonb DEFAULT '{}'::jsonb;
ALTER TABLE anime_data.scenes ADD COLUMN IF NOT EXISTS continuity_json jsonb DEFAULT '{}'::jsonb;
ALTER TABLE anime_data.scenes ADD COLUMN IF NOT EXISTS keyframe_url text;
ALTER TABLE anime_data.scenes ADD COLUMN IF NOT EXISTS scene_state_json jsonb DEFAULT '{}'::jsonb;
ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS shot_manifest jsonb DEFAULT '[]'::jsonb;
ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS camera_json jsonb DEFAULT '{}'::jsonb;
ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS continuity_json jsonb DEFAULT '{}'::jsonb;
ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS keyframe_url text;
ALTER TABLE anime_data.clips ADD COLUMN IF NOT EXISTS scene_state_json jsonb DEFAULT '{}'::jsonb;
ALTER TABLE anime_data.episodes ADD COLUMN IF NOT EXISTS artifact_manifest jsonb DEFAULT '{}'::jsonb;
ALTER TABLE anime_data.quota_usage ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE anime_data.episodes ALTER COLUMN season_no SET DEFAULT 1;
ALTER TABLE anime_data.episodes ALTER COLUMN season_no SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS projects_id_uidx ON anime_data.projects (id);
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_id_uidx ON anime_data.artifacts (id);
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_project_id_artifact_code_key ON anime_data.artifacts (project_id, artifact_code);
CREATE UNIQUE INDEX IF NOT EXISTS audio_usage_log_id_uidx ON anime_data.audio_usage_log (id);
CREATE UNIQUE INDEX IF NOT EXISTS audit_log_id_uidx ON anime_data.audit_log (id);
CREATE UNIQUE INDEX IF NOT EXISTS bible_versions_id_uidx ON anime_data.bible_versions (id);
CREATE UNIQUE INDEX IF NOT EXISTS canon_facts_id_uidx ON anime_data.canon_facts (id);
CREATE UNIQUE INDEX IF NOT EXISTS char_ref_hist_project_char_ver_uniq ON anime_data.character_reference_history (project_id, character_code, reference_version);
CREATE UNIQUE INDEX IF NOT EXISTS char_ref_hist_project_code_ver_uniq ON anime_data.character_reference_history (project_id, character_code, reference_version);
CREATE UNIQUE INDEX IF NOT EXISTS character_arcs_id_uidx ON anime_data.character_arcs (id);
CREATE UNIQUE INDEX IF NOT EXISTS character_arcs_project_id_character_code_arc_name_key ON anime_data.character_arcs (project_id, character_code, arc_name);
CREATE UNIQUE INDEX IF NOT EXISTS character_knowledge_id_uidx ON anime_data.character_knowledge (id);
CREATE UNIQUE INDEX IF NOT EXISTS character_knowledge_project_id_character_code_knowledge_key_key ON anime_data.character_knowledge (project_id, character_code, knowledge_key);
CREATE UNIQUE INDEX IF NOT EXISTS character_reference_history_id_uidx ON anime_data.character_reference_history (id);
CREATE UNIQUE INDEX IF NOT EXISTS character_relationships_id_uidx ON anime_data.character_relationships (id);
CREATE UNIQUE INDEX IF NOT EXISTS character_relationships_project_id_char_a_code_char_b_code_key ON anime_data.character_relationships (project_id, char_a_code, char_b_code);
CREATE UNIQUE INDEX IF NOT EXISTS character_status_history_id_uidx ON anime_data.character_status_history (id);
CREATE UNIQUE INDEX IF NOT EXISTS character_status_id_uidx ON anime_data.character_status (id);
CREATE UNIQUE INDEX IF NOT EXISTS character_status_project_char_unique ON anime_data.character_status (project_id, character_code);
CREATE UNIQUE INDEX IF NOT EXISTS character_status_project_id_character_code_key ON anime_data.character_status (project_id, character_code);
CREATE UNIQUE INDEX IF NOT EXISTS characters_id_uidx ON anime_data.characters (id);
CREATE UNIQUE INDEX IF NOT EXISTS characters_project_character_code_uniq ON anime_data.characters (project_id, character_code);
CREATE UNIQUE INDEX IF NOT EXISTS characters_project_code_uniq ON anime_data.characters (project_id, character_code);
CREATE UNIQUE INDEX IF NOT EXISTS clips_id_uidx ON anime_data.clips (id);
CREATE UNIQUE INDEX IF NOT EXISTS episode_analytics_id_uidx ON anime_data.episode_analytics (id);
CREATE UNIQUE INDEX IF NOT EXISTS episode_analytics_project_ep_platform_uniq ON anime_data.episode_analytics (project_id, episode_no, platform);
CREATE UNIQUE INDEX IF NOT EXISTS episode_states_id_uidx ON anime_data.episode_states (id);
CREATE UNIQUE INDEX IF NOT EXISTS episodes_id_uidx ON anime_data.episodes (id);
CREATE UNIQUE INDEX IF NOT EXISTS locations_id_uidx ON anime_data.locations (id);
CREATE UNIQUE INDEX IF NOT EXISTS locations_project_id_location_code_key ON anime_data.locations (project_id, location_code);
CREATE UNIQUE INDEX IF NOT EXISTS locations_project_name_uniq ON anime_data.locations (project_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS motion_library_id_uidx ON anime_data.motion_library (id);
CREATE UNIQUE INDEX IF NOT EXISTS motion_library_project_id_motion_key_age_group_key ON anime_data.motion_library (project_id, motion_key, age_group);
CREATE UNIQUE INDEX IF NOT EXISTS mystery_tracker_id_uidx ON anime_data.mystery_tracker (id);
CREATE UNIQUE INDEX IF NOT EXISTS pending_actions_id_uidx ON anime_data.pending_actions (id);
CREATE UNIQUE INDEX IF NOT EXISTS power_system_id_uidx ON anime_data.power_system (id);
CREATE UNIQUE INDEX IF NOT EXISTS power_system_project_id_character_code_power_name_key ON anime_data.power_system (project_id, character_code, power_name);
CREATE UNIQUE INDEX IF NOT EXISTS project_analytics_insights_id_uidx ON anime_data.project_analytics_insights (id);
CREATE UNIQUE INDEX IF NOT EXISTS published_content_id_uidx ON anime_data.published_content (id);
CREATE UNIQUE INDEX IF NOT EXISTS quota_usage_id_uidx ON anime_data.quota_usage (id);
CREATE UNIQUE INDEX IF NOT EXISTS quota_usage_project_id_usage_date_service_type_key ON anime_data.quota_usage (project_id, usage_date, service_type);
CREATE UNIQUE INDEX IF NOT EXISTS scene_library_id_uidx ON anime_data.scene_library (id);
CREATE UNIQUE INDEX IF NOT EXISTS scene_library_project_id_reuse_key_key ON anime_data.scene_library (project_id, reuse_key);
CREATE UNIQUE INDEX IF NOT EXISTS scenes_id_uidx ON anime_data.scenes (id);
CREATE UNIQUE INDEX IF NOT EXISTS scenes_scene_id_key ON anime_data.scenes (scene_id);
CREATE UNIQUE INDEX IF NOT EXISTS story_rules_id_uidx ON anime_data.story_rules (id);
CREATE UNIQUE INDEX IF NOT EXISTS story_state_snapshots_id_uidx ON anime_data.story_state_snapshots (id);
CREATE UNIQUE INDEX IF NOT EXISTS story_state_snapshots_unique ON anime_data.story_state_snapshots (project_id, episode_id, snapshot_version);
CREATE UNIQUE INDEX IF NOT EXISTS story_timeline_id_uidx ON anime_data.story_timeline (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canon_facts_proj_key ON anime_data.canon_facts (project_id, fact_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_story_rules_proj_rule ON anime_data.story_rules (project_id, rule_code);

CREATE UNIQUE INDEX IF NOT EXISTS episodes_project_season_ep_uidx
  ON anime_data.episodes (project_id, season_no, episode_no);
CREATE UNIQUE INDEX IF NOT EXISTS episode_states_project_season_ep_uidx
  ON anime_data.episode_states (project_id, season_no, episode_no);
CREATE UNIQUE INDEX IF NOT EXISTS scenes_project_season_ep_scene_uidx
  ON anime_data.scenes (project_id, season_no, episode_no, scene_order);
CREATE UNIQUE INDEX IF NOT EXISTS clips_project_season_ep_scene_uidx
  ON anime_data.clips (project_id, season_no, episode_no, scene_order);

CREATE INDEX IF NOT EXISTS idx_anime_data_projects_user ON anime_data.projects (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anime_data_episodes_project ON anime_data.episodes (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_episode_states_project ON anime_data.episode_states (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_scenes_project ON anime_data.scenes (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_clips_project ON anime_data.clips (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_characters_project ON anime_data.characters (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_character_status_project ON anime_data.character_status (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_character_status_history_project ON anime_data.character_status_history (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_character_arcs_project ON anime_data.character_arcs (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_character_reference_history_project ON anime_data.character_reference_history (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_character_knowledge_project ON anime_data.character_knowledge (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_character_relationships_project ON anime_data.character_relationships (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_power_system_project ON anime_data.power_system (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_locations_project ON anime_data.locations (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_artifacts_project ON anime_data.artifacts (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_story_rules_project ON anime_data.story_rules (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_story_timeline_project ON anime_data.story_timeline (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_story_state_snapshots_project ON anime_data.story_state_snapshots (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_canon_facts_project ON anime_data.canon_facts (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_bible_versions_project ON anime_data.bible_versions (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_mystery_tracker_project ON anime_data.mystery_tracker (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_scene_library_project ON anime_data.scene_library (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_motion_library_project ON anime_data.motion_library (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_quota_usage_project ON anime_data.quota_usage (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_pending_actions_project ON anime_data.pending_actions (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_episode_analytics_project ON anime_data.episode_analytics (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_project_analytics_insights_project ON anime_data.project_analytics_insights (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_audio_usage_log_project ON anime_data.audio_usage_log (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_published_content_project ON anime_data.published_content (project_id);
CREATE INDEX IF NOT EXISTS idx_anime_data_audit_log_project ON anime_data.audit_log (project_id);

CREATE INDEX IF NOT EXISTS idx_anime_data_episodes_project_season_ep ON anime_data.episodes (project_id, season_no, episode_no);
CREATE INDEX IF NOT EXISTS idx_anime_data_episode_states_project_season_ep ON anime_data.episode_states (project_id, season_no, episode_no);
CREATE INDEX IF NOT EXISTS idx_anime_data_scenes_project_season_ep_order ON anime_data.scenes (project_id, season_no, episode_no, scene_order);
CREATE INDEX IF NOT EXISTS idx_anime_data_clips_project_season_ep_order ON anime_data.clips (project_id, season_no, episode_no, scene_order);

INSERT INTO anime_data.schema_migrations (version) VALUES (1) ON CONFLICT (version) DO NOTHING;
INSERT INTO anime_data.schema_migrations (version) VALUES (2) ON CONFLICT (version) DO NOTHING;`;
