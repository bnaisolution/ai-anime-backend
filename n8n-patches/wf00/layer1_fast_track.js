const ctx = $input.item.json;
const rawText = (ctx.rawText || '').trim();
const payload = ctx.payload || {};

const VALID_INTENTS = new Set([
  'QUICK_GENERATE_REEL', 'GENERATE_EPISODE', 'REGENERATE_EPISODE', 'CONTINUE_EPISODE',
  'QUICK_GENERATE_IMAGE', 'QUICK_GENERATE_VIDEO', 'SAVE_TO_PROJECT', 'VISION_ANALYSIS',
  'CHANGE_CHARACTER_VOICE', 'PREVIEW_VOICE', 'LIST_VOICES', 'RESET_VOICE',
  'CHECK_CANON', 'VIEW_CANON', 'APPROVE_CANON_CHANGE', 'REJECT_CANON_CHANGE', 'CHECK_CONTINUITY',
  'CHECK_QUOTA', 'RETRY_FAILED', 'VIEW_STATE', 'VIEW_AUDIT', 'RUN_QC', 'PUBLISH_NOW',
  'VIEW_ANALYTICS', 'ADMIN_START_KAGGLE', 'ADMIN_STOP_KAGGLE', 'ADMIN_STATUS', 'DB_TEST', 'SYSTEM_HEALTH',
  'CREATE_PROJECT', 'OPEN_PROJECT', 'SAVE_BIBLE', 'BIBLE_CHAT'
]);

const epNumMatch = rawText.match(/(?:ep(?:isode)?\s*#?\s*|#)([0-9]{1,4})\b/i);
const resolvedEpNo = epNumMatch ? parseInt(epNumMatch[1], 10) : (ctx.episode_no || ctx.episode_number || 1);

if (ctx.intent && VALID_INTENTS.has(ctx.intent.toUpperCase().trim())) {
  const lockedIntent = ctx.intent.toUpperCase().trim();
  return {
    json: {
      ...ctx, intent: lockedIntent, skip_llm: true,
      classification: {
        intent: lockedIntent, confidence: 1.0, reason: 'Explicit backend body.intent provided', classifier_layer: 'LAYER_0_PAYLOAD_DIRECT',
        extracted_params: {
          episode_number: resolvedEpNo, season_no: ctx.season_no || 1,
          mode: ctx.mode || (['QUICK_GENERATE_REEL', 'QUICK_GENERATE_IMAGE', 'QUICK_GENERATE_VIDEO'].includes(lockedIntent) ? 'QUICK' : 'SAVE'),
          character_name: payload.character_name || payload.character_code || null, voice_id: payload.voice_id || null
        }
      }
    },
    binary: $input.item.binary || {}
  };
}

let matchedIntent = null;
if (/^[#*!/]/.test(rawText)) {
  const cmdBody = rawText.replace(/^[#*!/]+\s*/, '').trim().toLowerCase();
  const prefixRules = [
    { pattern: /^ep(?:isode)?\s+\d+.*(?:regen|retry|redo)/i, intent: 'REGENERATE_EPISODE' },
    { pattern: /^regen(?:erate)?\s+ep/i, intent: 'REGENERATE_EPISODE' },
    { pattern: /^cont(?:inue)?\s+ep/i, intent: 'CONTINUE_EPISODE' },
    { pattern: /^(?:ep|episode|generate_episode)\b/i, intent: 'GENERATE_EPISODE' },
    { pattern: /^(?:quick_reel|reel|short|quick_generate_reel)\b/i, intent: 'QUICK_GENERATE_REEL' },
    { pattern: /^(?:vid|video|quick_video|quick_generate_video)\b/i, intent: 'QUICK_GENERATE_VIDEO' },
    { pattern: /^(?:img|image|quick_image|quick_generate_image)\b/i, intent: 'QUICK_GENERATE_IMAGE' },
    { pattern: /^change_voice\b/i, intent: 'CHANGE_CHARACTER_VOICE' },
    { pattern: /^save_bible\b/i, intent: 'SAVE_BIBLE' },
    { pattern: /^status\b/i, intent: 'ADMIN_STATUS' },
    { pattern: /^quota\b/i, intent: 'CHECK_QUOTA' },
    { pattern: /^canon\b/i, intent: 'CHECK_CANON' },
    { pattern: /^continuity\b/i, intent: 'CHECK_CONTINUITY' },
    { pattern: /^retry_failed\b/i, intent: 'RETRY_FAILED' }
  ];
  for (const rule of prefixRules) {
    if (rule.pattern.test(cmdBody)) { matchedIntent = rule.intent; break; }
  }
}

if (matchedIntent) {
  return {
    json: {
      ...ctx, intent: matchedIntent, skip_llm: true,
      classification: {
        intent: matchedIntent, confidence: 1.0, reason: 'Matched Layer 1 command prefix', classifier_layer: 'LAYER_1_PREFIX',
        extracted_params: {
          episode_number: resolvedEpNo, season_no: ctx.season_no || 1,
          mode: ctx.mode || (['QUICK_GENERATE_REEL', 'QUICK_GENERATE_IMAGE', 'QUICK_GENERATE_VIDEO'].includes(matchedIntent) ? 'QUICK' : 'SAVE'),
          character_name: payload.character_name || null, voice_id: payload.voice_id || null
        }
      }
    },
    binary: $input.item.binary || {}
  };
}

return { json: { ...ctx, skip_llm: false, classification: null }, binary: $input.item.binary || {} };
