const triggerCtx = $('When Executed by Another Workflow').first().json || {};
const state = $('Canon Verdict & Locked Fact Protection Engine').first().json || {};
const violationsText = (state.violations || []).length > 0
  ? state.violations.map((v, i) => `${i + 1}. **[${v.type}]** ${v.description}`).join('\n')
  : '• Koi Canon Contradiction ya Knowledge Graph Violation nahi mila.';

const summaryMsg = [
  `${state.isValid ? '✅' : '🛑'} **WF-09: Canon Engine Verdict (${state.operation_mode})**`,
  `📁 **Project:** ${state.project_name} | **Episode:** ${state.episode_no} | **Valid:** \`${state.isValid}\``,
  violationsText
].join('\n');

return {
  json: {
    ...triggerCtx,
    project_id: state.project_id || triggerCtx.project_id,
    project_name: state.project_name || triggerCtx.project_name,
    episode_no: state.episode_no || triggerCtx.episode_no || 1,
    episode_number: state.episode_no || triggerCtx.episode_number || 1,
    season_no: state.season_no || triggerCtx.season_no || 1,
    season_number: state.season_no || triggerCtx.season_number || 1,
    mode: state.mode || triggerCtx.mode || 'SAVE',
    sessionId: state.sessionId || triggerCtx.sessionId,
    intent: state.intent || triggerCtx.intent,
    downstream_command: state.downstream_command || state.intent || triggerCtx.intent,
    target_workflow_id: state.target_workflow_id || triggerCtx.target_workflow_id || $env.WF_02_STORY_ID || null,
    preflight_workflow_ids: state.preflight_workflow_ids || triggerCtx.preflight_workflow_ids || {},
    extracted_params: state.extracted_params || triggerCtx.extracted_params || { episode_number: state.episode_no },
    user_prompt: state.user_prompt || state.userPrompt || state.rawText || triggerCtx.user_prompt,
    userPrompt: state.userPrompt || state.user_prompt || state.rawText || triggerCtx.userPrompt,
    rawText: state.rawText || state.user_prompt || triggerCtx.rawText,
    user_infrastructure: state.user_infrastructure || triggerCtx.user_infrastructure || {},
    project_style: state.project_style || triggerCtx.project_style || { visual_style: 'ANIME' },
    ok: state.isValid,
    workflow_name: 'WF-09',
    execution_id: $execution.id,
    operation_mode: state.operation_mode,
    isValid: state.isValid,
    violations: state.violations,
    new_facts_to_add: state.new_facts_to_add,
    new_knowledge_to_add: state.new_knowledge_to_add,
    output: summaryMsg,
    text: summaryMsg
  }
};
