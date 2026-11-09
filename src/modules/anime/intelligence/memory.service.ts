import { animeSupabase } from '../db/anime.supabase';
import { getEmbedding } from '../../../core/ai-brain/modelRouter';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export async function writeMemory(projectId: string, type: string, content: string, metadata: any = {}): Promise<any> {
  const embedding = await getEmbedding(content);
  const { data, error } = await animeSupabase
    .from('memory_knowledge')
    .insert({
      project_id: projectId,
      memory_type: type,
      content,
      embedding: embedding ? toVectorLiteral(embedding) : null,
      metadata,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function retrieveContext(projectId: string, queryString: string): Promise<any[]> {
  const embedding = await getEmbedding(queryString);
  if (embedding) {
    const { data: rpc } = await animeSupabase.rpc('match_memory_knowledge', {
      p_project_id: projectId,
      p_query_embedding: toVectorLiteral(embedding),
      p_match_count: 3,
    });
    if (Array.isArray(rpc) && rpc.length > 0) return rpc;
  }

  const term = escapeLike((queryString || '').trim());
  if (term.length > 0) {
    const { data: lexical } = await animeSupabase
      .from('memory_knowledge')
      .select('*')
      .eq('project_id', projectId)
      .ilike('content', `%${term}%`)
      .order('created_at', { ascending: false })
      .limit(3);
    if (Array.isArray(lexical) && lexical.length > 0) return lexical;
  }

  const { data: fallback } = await animeSupabase
    .from('memory_knowledge')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(3);
  return fallback ?? [];
}
