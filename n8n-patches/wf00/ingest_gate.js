const item = $input.item;
const rawJson = item.json || {};
const body = rawJson.body || rawJson;
const nestedPayload = (body.payload && typeof body.payload === 'object') ? body.payload : {};
const binaryData = item.binary || null;

const explicitIntent = (body.intent || nestedPayload.intent || rawJson.intent)
  ? (body.intent || nestedPayload.intent || rawJson.intent).toString().toUpperCase().trim()
  : null;

const user_infrastructure = body.user_infrastructure || nestedPayload.user_infrastructure || rawJson.user_infrastructure || {};
const project_style = body.project_style || nestedPayload.project_style || rawJson.project_style || { visual_style: 'ANIME' };

const rawText = (
  body.chatInput || body.rawText || body.text || body.message || body.userPrompt || body.user_prompt || body.prompt ||
  nestedPayload.prompt || nestedPayload.userPrompt || nestedPayload.user_prompt || nestedPayload.rawText ||
  (explicitIntent ? `#${explicitIntent.toLowerCase()}` : '')
).toString().trim();

const sessionId = (body.sessionId || body.session_id || nestedPayload.sessionId || rawJson.sessionId || `sess_${$execution.id}`).toString();

const incomingProjectId = (
  body.project_id || body.projectId || nestedPayload.project_id || rawJson.project_id ||
  (rawJson.headers && rawJson.headers['x-project-id']) || null
);

const episode_no = Number(body.episode_no || body.episode_number || nestedPayload.episode_no || nestedPayload.episode_number || 1);
const season_no = Number(body.season_no || body.season_number || nestedPayload.season_no || nestedPayload.season_number || 1);
const rawMode = body.mode || nestedPayload.mode;
const incomingMode = rawMode
  ? rawMode.toString().toUpperCase().trim()
  : (['QUICK_GENERATE_REEL', 'QUICK_GENERATE_IMAGE', 'QUICK_GENERATE_VIDEO', 'VISION_ANALYSIS'].includes(explicitIntent) ? 'QUICK' : 'SAVE');

const youtubeRegex = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S+)?/i;
const generalMediaUrlRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp|gif|mp3|wav|ogg|m4a|mp4|mov|pdf|doc|docx)(?:\?[^\s]*)?)/i;

let modality = 'text_only';
let mediaUrl = body.mediaUrl || body.media_url || nestedPayload.mediaUrl || nestedPayload.media_url || null;
let binaryMeta = null;

if (binaryData && Object.keys(binaryData).length > 0) {
  const firstKey = Object.keys(binaryData)[0];
  const bin = binaryData[firstKey];
  const mime = (bin.mimeType || '').toLowerCase();
  const fileName = (bin.fileName || '').toLowerCase();
  binaryMeta = { binaryKey: firstKey, mimeType: mime, fileName: bin.fileName || 'attachment', fileSize: bin.fileSize || null };
  if (mime.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif)$/.test(fileName)) modality = 'image';
  else if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/.test(fileName)) modality = 'audio';
  else if (mime === 'application/pdf' || mime.includes('word') || mime.includes('document') || /\.(pdf|doc|docx|txt|md)$/.test(fileName)) modality = 'document';
}

const ytMatch = rawText.match(youtubeRegex) || (mediaUrl && mediaUrl.toString().match(youtubeRegex));
if (ytMatch) {
  modality = 'youtube';
  mediaUrl = ytMatch[0];
} else if (modality === 'text_only') {
  const urlMatch = rawText.match(generalMediaUrlRegex) || (mediaUrl && mediaUrl.toString().match(generalMediaUrlRegex));
  if (urlMatch) {
    mediaUrl = urlMatch[0];
    const lowerUrl = mediaUrl.toLowerCase();
    if (/\.(png|jpg|jpeg|webp|gif)/.test(lowerUrl)) modality = 'image';
    else if (/\.(mp3|wav|ogg|m4a)/.test(lowerUrl)) modality = 'audio';
    else if (/\.(pdf|doc|docx)/.test(lowerUrl)) modality = 'document';
  }
}

let userPrompt = rawText || `Execute ${explicitIntent || 'GENERATE_EPISODE'}`;
if (mediaUrl && userPrompt.includes(mediaUrl)) {
  userPrompt = userPrompt.replace(mediaUrl, '').replace(/\s{2,}/g, ' ').trim();
}
if (!userPrompt && modality !== 'text_only') {
  userPrompt = `[Attached ${modality.toUpperCase()} Input]`;
}

const SENSITIVE_KEY_PATTERN = /(api[-_ ]?key|token|secret|password|authorization|bearer|credential|service[-_ ]?role)/i;
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) cleaned[k] = '[REDACTED_BY_RULE_16]';
    else if (typeof v === 'object' && v !== null) cleaned[k] = sanitizeObject(v);
    else if (typeof v === 'string' && /(sk-[a-zA-Z0-9]{16,}|gsk_[a-zA-Z0-9]{16,}|eyJ[a-zA-Z0-9_-]{10,}\.)/.test(v)) cleaned[k] = '[REDACTED_TOKEN_PATTERN]';
    else cleaned[k] = v;
  }
  return cleaned;
}

return {
  json: {
    command_id: body.command_id || nestedPayload.command_id || null,
    request_id: body.request_id || nestedPayload.request_id || `req_${$execution.id}`,
    idempotency_key: body.idempotency_key || nestedPayload.idempotency_key || null,
    intent: explicitIntent,
    user_infrastructure,
    project_style,
    payload: nestedPayload,
    rawText,
    binary: binaryMeta,
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
