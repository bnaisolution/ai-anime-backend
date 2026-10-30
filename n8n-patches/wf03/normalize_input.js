const raw = $input.item.json || {};
const dispatch = raw.wf03_dispatch_payload || raw.payload || raw;
const project_id = dispatch.project_id || raw.project_id || null;
const episode_no = Number(dispatch.episode_no || dispatch.episode_number || raw.episode_no || raw.episode_number || 1);
const season_no = Number(dispatch.season_no || dispatch.season_number || raw.season_no || 1);
const intent = (dispatch.intent || raw.intent || 'SAVE_TO_PROJECT').toString().toUpperCase().trim();
const isQuickAdHoc = ['QUICK_GENERATE_IMAGE', 'QUICK_GENERATE_VIDEO'].includes(intent) && raw.mode !== 'SAVE';
const mode = isQuickAdHoc ? 'QUICK' : 'SAVE';
const scene_count = Number(dispatch.total_scenes || dispatch.scene_count || raw.scene_count || (isQuickAdHoc ? 1 : 0));
const user_infrastructure = dispatch.user_infrastructure || raw.user_infrastructure || {};
const project_style = dispatch.project_style || raw.project_style || { visual_style: 'ANIME' };
const visual_style = (project_style.visual_style || dispatch.visual_style || 'ANIME').toString().toUpperCase().trim();
const style_prefix = visual_style === 'REALISTIC'
  ? 'Photorealistic cinematic film still, 8k RAW live-action photography, ARRI Alexa 65, hyper-detailed realistic skin texture, natural volumetric lighting'
  : 'Masterpiece cel-shaded anime key visual, ufotable and Makoto Shinkai anime aesthetic, crisp anime lineart, vibrant dynamic anime lighting';
const negative_prompt = visual_style === 'REALISTIC'
  ? 'anime, cartoon, cel-shaded, 2d illustration, drawing, sketch, lowres, bad anatomy, deformed'
  : 'photorealistic, 3d render, live action, real photo, blurry, lowres, bad anatomy, extra fingers';

if (!project_id) throw new Error('WF-03 Error: project_id is strictly required (Rule 5 Project Isolation).');

return {
  json: {
    ...raw, project_id, episode_no, episode_number: episode_no, season_no, intent, mode, scene_count,
    prompt: dispatch.prompt || raw.user_prompt || raw.userPrompt || raw.rawText || '',
    media_type: dispatch.media_type || (intent === 'QUICK_GENERATE_VIDEO' ? 'VIDEO' : 'IMAGE'),
    user_infrastructure, project_style: { ...project_style, visual_style }, visual_style, style_prefix, negative_prompt, execution_id: $execution.id
  }
};
