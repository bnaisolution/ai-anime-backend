const item = $input.item;
const rawJson = item.json || {};
const body = rawJson.body || rawJson;
const binaryData = item.binary || null;

const explicitIntent = body.intent || rawJson.intent
  ? (body.intent || rawJson.intent).toString().toUpperCase().trim()
  : null;

const user_infrastructure = body.user_infrastructure || rawJson.user_infrastructure || {};
const project_style = body.project_style || rawJson.project_style || { visual_style: 'ANIME' };

const rawText = (
  body.chatInput ||
  body.rawText ||
  body.text ||
  body.message ||
  body.userPrompt ||
  body.user_prompt ||
  (explicitIntent ? `#${explicitIntent.toLowerCase()}` : '')
).toString().trim();

const sessionId = (
  body.sessionId ||
  body.session_id ||
  rawJson.sessionId ||
  `sess_${$execution.id}`
).toString();

const incomingProjectId = (
  body.project_id ||
  body.projectId ||
  rawJson.project_id ||
  (rawJson.headers && rawJson.headers['x-project-id']) ||
  null
);

const episode_no = Number(body.episode_no || body.episode_number || 1);
const season_no = Number(body.season_no || body.season_number || 1);
const incomingMode = body.mode ? body.mode.toString().toUpperCase().trim() : (explicitIntent === 'QUICK_GENERATE_REEL' ? 'QUICK' : 'SAVE');

let modality = 'text_only';
let mediaUrl = body.mediaUrl || body.media_url || null;
let userPrompt = rawText || `Execute ${explicitIntent || 'GENERATE_EPISODE'}`;

const SENSITIVE_KEY_PATTERN = /(api[-_ ]?key|token|secret|password|authorization|bearer|credential|service[-_ ]?role)/i;
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) cleaned[k] = '[REDACTED_BY_RULE_16]';
    else if (typeof v === 'object' && v !== null) cleaned[k] = sanitizeObject(v);
    else cleaned[k] = v;
  }
  return cleaned;
}

return {
  json: {
    intent: explicitIntent,
    user_infrastructure,
    project_style,
    rawText,
    modality,
    mediaUrl,
    userPrompt,
    user_prompt: userPrompt,
    project_id: incomingProjectId,
    episode_no,
    episode_number: episode_no,
    season_no,
    season_number: season_no,
    sessionId,
    mode: incomingMode,
    trigger_source: rawJson.chatInput !== undefined ? 'CHAT' : 'WEBHOOK',
    sanitized_payload: sanitizeObject(body)
  },
  binary: binaryData || {}
};
