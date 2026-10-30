const ctx = $input.item.json;
const ingest = $('Ingest Gate & Aankh Inspector').first().json;

const project_id = ctx.project_id || ingest.project_id;
const user_infrastructure = ctx.user_infrastructure || ingest.user_infrastructure || {};
const project_style = ctx.project_style || ingest.project_style || { visual_style: 'ANIME' };
const intent = (ctx.intent || ingest.intent || 'GENERATE_EPISODE').toString().toUpperCase().trim();

const preflight_workflow_ids = {
  wf_12_quota: $env.WF_12_QUOTA_ID,
  wf_09_canon: $env.WF_09_CANON_ID,
  wf_06_continuity: $env.WF_06_CONTINUITY_ID,
  wf_10_state: $env.WF_10_STATE_ID
};

const ROUTE_MAP = {
  QUICK_GENERATE_REEL:    { branch: 'WF_02_DIRECT_REEL', wf_id: $env.WF_02_STORY_ID, bypass_preflight: true, mode: 'QUICK' },
  GENERATE_EPISODE:       { branch: 'WF_02_CHAINED', wf_id: $env.WF_02_STORY_ID, bypass_preflight: false, mode: 'SAVE' },
  REGENERATE_EPISODE:     { branch: 'WF_02_CHAINED', wf_id: $env.WF_02_STORY_ID, bypass_preflight: false, mode: 'SAVE' },
  CONTINUE_EPISODE:       { branch: 'WF_02_CHAINED', wf_id: $env.WF_02_STORY_ID, bypass_preflight: false, mode: 'SAVE' },
  QUICK_GENERATE_IMAGE:   { branch: 'WF_03', wf_id: $env.WF_03_PROD_ID, bypass_preflight: true, mode: 'QUICK' },
  QUICK_GENERATE_VIDEO:   { branch: 'WF_03', wf_id: $env.WF_03_PROD_ID, bypass_preflight: true, mode: 'QUICK' },
  SAVE_TO_PROJECT:        { branch: 'WF_03', wf_id: $env.WF_03_PROD_ID, bypass_preflight: true, mode: 'SAVE' },
  CREATE_PROJECT:         { branch: 'WF_01', wf_id: $env.WF_01_BIBLE_ID, bypass_preflight: true },
  SAVE_BIBLE:             { branch: 'WF_01', wf_id: $env.WF_01_BIBLE_ID, bypass_preflight: true },
  BIBLE_CHAT:             { branch: 'WF_01', wf_id: $env.WF_01_BIBLE_ID, bypass_preflight: true },
  VISION_ANALYSIS:        { branch: 'WF_05', wf_id: $env.WF_05_VISION_ID, bypass_preflight: true }
};

const route = ROUTE_MAP[intent] || { branch: 'WF_04', wf_id: $env.WF_04_ADMIN_ID, bypass_preflight: true };

return {
  json: {
    ...ctx,
    project_id,
    intent,
    downstream_command: intent,
    mode: route.mode || ctx.mode || 'SAVE',
    dispatch_branch: route.branch,
    target_workflow_id: route.wf_id,
    bypass_preflight: Boolean(route.bypass_preflight),
    preflight_workflow_ids,
    user_infrastructure,
    project_style
  }
};
