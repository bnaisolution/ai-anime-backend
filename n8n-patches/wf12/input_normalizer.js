const item = $input.item.json || {};
const raw = item.body || item;
const extracted = raw.extracted_params || {};
const project_id = raw.project_id || raw.projectId || extracted.project_id || null;
const user_infrastructure = raw.user_infrastructure || item.user_infrastructure || {};
const project_style = raw.project_style || item.project_style || { visual_style: 'ANIME' };
const service_type = (raw.service_type || (['GENERATE_EPISODE', 'QUICK_GENERATE_REEL'].includes(raw.intent) ? 'GPU' : 'LLM')).toString().toUpperCase().trim();
const estimated_cost_units = Number(raw.estimated_cost_units !== undefined ? raw.estimated_cost_units : (service_type === 'GPU' ? 250 : 50));
const usage_date = $now.toISOString().slice(0, 10);
if (!project_id) throw new Error('WF-12 Error: project_id is strictly required for Quota Governance (Rule 5).');

return {
  json: {
    ...raw, project_id, user_infrastructure, project_style, service_type, estimated_cost_units, usage_date,
    sessionId: (raw.sessionId || `sess_${$execution.id}`).toString()
  }
};
