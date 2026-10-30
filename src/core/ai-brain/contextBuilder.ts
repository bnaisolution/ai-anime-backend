import { FastifyInstance } from 'fastify';
import { AuthContext } from '../../plugins/auth';
import { getEmbedding } from './modelRouter';

export async function buildSmartContext(
  fastify: FastifyInstance,
  auth: AuthContext,
  userMessage: string,
  projectId: string,
  skillKey: string
): Promise<string> {
  let contextParts: string[] = [];
  const isOwner = auth.role === 'owner_admin';

  const { data: appKnowledge } = await fastify.supabase
    .from('ai_app_knowledge')
    .select('category, name, description')
    .limit(10);
  if (appKnowledge && appKnowledge.length > 0) {
    contextParts.push('APP KNOWLEDGE: ' + JSON.stringify(appKnowledge));
  }
  let skillsQuery = fastify.supabase.from('ai_skill_registry').select('skill_key, name, description');
  if (!isOwner) {
    skillsQuery = skillsQuery.eq('owner_only', false);
  }
  const { data: skills } = await skillsQuery.limit(10);
  if (skills && skills.length > 0) {
    contextParts.push('AVAILABLE SKILLS: ' + JSON.stringify(skills));
  }
  if (isOwner) {
    const { data: wfs } = await fastify.supabase
      .from('ai_wf_registry')
      .select('namespace, wf_id, name, description')
      .limit(20);
    if (wfs && wfs.length > 0) {
      contextParts.push('INTERNAL WORKFLOWS (Owner Only): ' + JSON.stringify(wfs));
    }
  } else {
    contextParts.push('STRICT RULE: You are talking to a Normal User. NEVER reveal internal Workflow IDs.');
  }
  const embedding = await getEmbedding(userMessage);
  if (embedding) {
    const { data: mems } = await fastify.supabase.rpc('match_memory_items', {
      p_owner_id: auth.userId,
      p_project_id: projectId,
      p_query_embedding: '[' + embedding.join(',') + ']',
      p_match_threshold: 0.5,
      p_match_count: 5
    });
    if (mems && mems.length > 0) {
      contextParts.push('RELEVANT MEMORY: ' + mems.map((m: any) => m.content).join(' '));
    }
  }
  return contextParts.join('\n\n');
}
