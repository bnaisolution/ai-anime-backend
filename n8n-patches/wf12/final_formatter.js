let triggerCtx = {};
try { triggerCtx = $('When Executed by Another Workflow').first().json || {}; } catch (e) { triggerCtx = $input.first().json || {}; }
let state = {};
try { state = $('Quota & Throttling Evaluator').first().json || {}; } catch (e) { state = $input.first().json || {}; }
const isAllowed = state.is_allowed !== undefined ? state.is_allowed : true;
const msg = isAllowed ? `✅ **WF-12: Quota Approved (${state.service_type || 'LLM'})!** (${state.projected_total_units || 0}/${state.daily_quota_limit || 10000} units)` : `🛑 **WF-12: QUOTA_EXCEEDED (${state.service_type || 'LLM'})!**`;
return {
  json: {
    ...triggerCtx, ...state, project_id: state.project_id || triggerCtx.project_id, user_infrastructure: state.user_infrastructure || triggerCtx.user_infrastructure || {},
    project_style: state.project_style || triggerCtx.project_style || { visual_style: 'ANIME' }, ok: isAllowed, status: state.quota_status || 'APPROVED', workflow_name: 'WF-12',
    execution_id: $execution.id, is_allowed: isAllowed, remaining_quota: state.remaining_quota_units ?? 10000, output: msg, text: msg
  }
};
