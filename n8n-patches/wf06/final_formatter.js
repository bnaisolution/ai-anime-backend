let triggerCtx = {};
try { triggerCtx = $('When Executed by Another Workflow').first().json || {}; } catch (e) { triggerCtx = $input.first().json || {}; }
let state = {};
try { state = $('Continuity Score & Decision Engine').first().json || {}; } catch (e) { state = $input.first().json || {}; }

const badge = state.gate_status === 'PASSED' ? '✅ PASSED' : state.gate_status === 'WARNINGS_RESOLVED' ? '⚠️ WARNINGS_RESOLVED' : '🛑 BLOCKED_CRITICAL';
const msg = [`🛡️ **WF-06 Continuity Report**`, `📊 **Score:** ${state.continuity_score ?? 100}/100 | **Gate:** ${badge}`, `💬 **Summary:** ${state.continuity_summary || 'Continuity check completed.'}`].join('\n');
const basePrompt = state.user_prompt || triggerCtx.user_prompt || triggerCtx.userPrompt || '';
const patchedUserPrompt = state.can_proceed && Array.isArray(state.violations) && state.violations.length > 0
  ? `${basePrompt}\n\n[PATCHES]: ${JSON.stringify(state.recommended_context_patches || {})}` : basePrompt;

return {
  json: {
    ...triggerCtx, user_infrastructure: state.user_infrastructure || triggerCtx.user_infrastructure || {}, project_style: state.project_style || triggerCtx.project_style || { visual_style: 'ANIME' },
    project_id: state.project_id || triggerCtx.project_id, project_name: state.project_name || triggerCtx.project_name || 'Active Anime Project',
    episode_no: state.episode_no || triggerCtx.episode_no || 1, episode_number: state.episode_no || triggerCtx.episode_number || 1,
    season_no: state.season_no || triggerCtx.season_no || 1, season_number: state.season_no || triggerCtx.season_number || 1,
    mode: state.mode || triggerCtx.mode || 'SAVE', sessionId: state.sessionId || triggerCtx.sessionId, intent: triggerCtx.intent || state.intent || 'CHECK_CONTINUITY',
    downstream_command: triggerCtx.downstream_command || state.downstream_command || 'CHECK_CONTINUITY', target_workflow_id: state.target_workflow_id || triggerCtx.target_workflow_id || $env.WF_02_STORY_ID || null,
    preflight_workflow_ids: state.preflight_workflow_ids || triggerCtx.preflight_workflow_ids || {}, extracted_params: state.extracted_params || triggerCtx.extracted_params || { episode_number: state.episode_no || 1 },
    user_prompt: patchedUserPrompt, userPrompt: patchedUserPrompt, rawText: state.rawText || patchedUserPrompt, ok: state.can_proceed !== undefined ? state.can_proceed : true,
    workflow_name: 'WF-06', execution_id: $execution.id, continuity_score: state.continuity_score ?? 100, status: state.gate_status || 'PASSED', gate_status: state.gate_status || 'PASSED',
    can_proceed: state.can_proceed !== undefined ? state.can_proceed : true, violations: state.violations || [], violations_count: state.violations_count || 0,
    continuity_summary: state.continuity_summary || '', recommended_context_patches: state.recommended_context_patches || {}, output: msg, text: msg
  }
};
