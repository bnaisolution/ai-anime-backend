const triggerCtx = $('When Executed by Another Workflow').first().json || {};
const state = $('Quota & Throttling Evaluator').first().json || {};

const msg = state.is_allowed
  ? `✅ **WF-12: Quota Approved (${state.service_type})!** (${state.projected_total_units}/${state.daily_quota_limit} units)`
  : `🛑 **WF-12: QUOTA_EXCEEDED (${state.service_type})!**`;

return {
  json: {
    ...triggerCtx,
    ...state,
    project_id: state.project_id || triggerCtx.project_id,
    user_infrastructure: state.user_infrastructure || triggerCtx.user_infrastructure || {},
    project_style: state.project_style || triggerCtx.project_style || { visual_style: 'ANIME' },
    ok: state.is_allowed,
    status: state.quota_status,
    workflow_name: 'WF-12',
    execution_id: $execution.id,
    is_allowed: state.is_allowed,
    remaining_quota: state.remaining_quota_units,
    output: msg,
    text: msg
  }
};
