const item = $input.item.json || {};
const raw = item.body || item;
const extracted = raw.extracted_params || {};

const project_id = raw.project_id || raw.projectId || extracted.project_id || null;
const project_name = raw.project_name || 'Active Anime Project';
const episode_no = Number(raw.episode_number || raw.episode_no || extracted.episode_number || 1);
const season_no = Number(raw.season_number || raw.season_no || raw.current_season || extracted.season_no || 1);

const intent = (raw.intent || 'GENERATE_EPISODE').toString().toUpperCase().trim();
const isQuickReel = intent === 'QUICK_GENERATE_REEL';
const mode = 'SAVE';

const user_infrastructure = raw.user_infrastructure || item.user_infrastructure || {};
const project_style = raw.project_style || item.project_style || { visual_style: 'ANIME' };
const visual_style = (project_style.visual_style || 'ANIME').toString().toUpperCase().trim();

const style_prefix = visual_style === 'REALISTIC'
  ? 'Photorealistic cinematic film still, 8k RAW live-action photography, ARRI Alexa 65, hyper-detailed realistic skin texture, natural volumetric lighting'
  : 'Masterpiece cel-shaded anime key visual, ufotable and Makoto Shinkai anime aesthetic, crisp anime lineart, vibrant dynamic anime lighting';

const user_prompt = (
  raw.user_prompt ||
  raw.userPrompt ||
  raw.rawText ||
  `Generate a 1-minute (${visual_style}) story reel and Section 14A scene plan for Episode ${episode_no}`
).toString().trim();

const sessionId = (raw.sessionId || `sess_${$execution.id}`).toString();

if (!project_id) {
  throw new Error('WF-02 Error: project_id is required (Rule 5 Project Isolation).');
}

return {
  json: {
    ...raw,
    project_id,
    project_name,
    episode_number: episode_no,
    episode_no,
    season_number: season_no,
    season_no,
    intent,
    is_quick_reel: isQuickReel,
    target_duration_sec: isQuickReel ? 60 : 120,
    mode,
    user_prompt,
    sessionId,
    user_infrastructure,
    project_style: { ...project_style, visual_style },
    visual_style,
    style_prefix
  }
};
