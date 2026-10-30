const ctx = $input.item.json;
const rawText = (ctx.rawText || '').trim();

const VALID_INTENTS = new Set([
  'QUICK_GENERATE_REEL',
  'GENERATE_EPISODE', 'REGENERATE_EPISODE', 'CONTINUE_EPISODE',
  'QUICK_GENERATE_IMAGE', 'QUICK_GENERATE_VIDEO', 'SAVE_TO_PROJECT', 'VISION_ANALYSIS',
  'CHANGE_CHARACTER_VOICE', 'PREVIEW_VOICE', 'LIST_VOICES', 'RESET_VOICE',
  'CHECK_CANON', 'VIEW_CANON', 'APPROVE_CANON_CHANGE', 'REJECT_CANON_CHANGE', 'CHECK_CONTINUITY',
  'CHECK_QUOTA', 'RETRY_FAILED', 'VIEW_STATE', 'VIEW_AUDIT', 'RUN_QC', 'PUBLISH_NOW',
  'VIEW_ANALYTICS', 'ADMIN_START_KAGGLE', 'ADMIN_STOP_KAGGLE', 'ADMIN_STATUS', 'DB_TEST', 'SYSTEM_HEALTH',
  'CREATE_PROJECT', 'OPEN_PROJECT', 'SAVE_BIBLE', 'BIBLE_CHAT'
]);

if (ctx.intent && VALID_INTENTS.has(ctx.intent.toUpperCase().trim())) {
  const lockedIntent = ctx.intent.toUpperCase().trim();
  return {
    json: {
      ...ctx,
      intent: lockedIntent,
      skip_llm: true,
      classification: {
        intent: lockedIntent,
        confidence: 1.0,
        reason: 'Explicit backend body.intent provided',
        classifier_layer: 'LAYER_0_PAYLOAD_DIRECT',
        extracted_params: {
          episode_number: ctx.episode_no || 1,
          season_no: ctx.season_no || 1,
          mode: ctx.mode || (lockedIntent === 'QUICK_GENERATE_REEL' ? 'QUICK' : 'SAVE')
        }
      }
    },
    binary: $input.item.binary || {}
  };
}

let matchedIntent = null;
const cmdBody = rawText.replace(/^[#!/]+/, '').trim();
if (/^(?:quick_reel|reel|quick_generate_reel)\b/i.test(cmdBody)) matchedIntent = 'QUICK_GENERATE_REEL';
else if (/^(?:ep|episode|generate_episode)\b/i.test(cmdBody)) matchedIntent = 'GENERATE_EPISODE';

if (matchedIntent) {
  return {
    json: {
      ...ctx,
      intent: matchedIntent,
      skip_llm: true,
      classification: {
        intent: matchedIntent,
        confidence: 1.0,
        reason: 'Matched Layer 1 command prefix',
        classifier_layer: 'LAYER_1_PREFIX',
        extracted_params: { episode_number: ctx.episode_no || 1, mode: ctx.mode || 'SAVE' }
      }
    },
    binary: $input.item.binary || {}
  };
}

return { json: { ...ctx, skip_llm: false, classification: null }, binary: $input.item.binary || {} };
