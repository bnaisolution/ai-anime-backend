import { ANIME_WORKFLOW_REGISTRY } from '../modules/anime/admin/workflowRegistry';

const CANONICAL_IDS = new Set(ANIME_WORKFLOW_REGISTRY.map((entry) => entry.id));

export function isAnimeWorkflowPayload(workflow: any): boolean {
  if (!workflow || typeof workflow !== 'object') return false;
  const name = String(workflow.name || '');
  const id = String(workflow.id || '');
  if (/storywf/i.test(name) || CANONICAL_IDS.has(id)) return true;
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  return nodes.some((node: any) => {
    const nodeName = String(node?.name || '');
    const webhookPath = String(node?.parameters?.path || '');
    return /storywf/i.test(nodeName) || /\/webhook\/wf00-gateway/i.test(webhookPath);
  });
}
