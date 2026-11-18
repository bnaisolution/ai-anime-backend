import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { animeSupabase } from '../../anime/db/anime.supabase';

export interface DirectorConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

function isMissingRelation(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code || '');
  const message = String((error as { message?: unknown })?.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(message);
}

export async function ensureDirectorConversation(
  fastify: FastifyInstance,
  userId: string,
  projectId: string,
  conversationId?: string | null
): Promise<string> {
  if (conversationId) {
    const { data } = await animeSupabase
      .from('director_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  const id = crypto.randomUUID();
  const { error } = await animeSupabase.from('director_conversations').insert({
    id,
    user_id: userId,
    project_id: projectId,
    title: 'AI Director conversation',
    updated_at: new Date().toISOString(),
  });
  if (error && !isMissingRelation(error)) throw error;
  return id;
}

export async function loadDirectorMessages(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
  limit = 10
): Promise<DirectorConversationMessage[]> {
  const { data, error } = await animeSupabase
    .from('director_messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return (data || []).reverse().map((row: Record<string, unknown>): DirectorConversationMessage => ({
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: String(row.content || ''),
  })).filter((message) => message.content.length > 0);
}

export async function appendDirectorMessage(
  fastify: FastifyInstance,
  input: {
    conversationId: string;
    userId: string;
    projectId: string;
    role: 'user' | 'assistant';
    content: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await animeSupabase.from('director_messages').insert({
    id: crypto.randomUUID(),
    conversation_id: input.conversationId,
    user_id: input.userId,
    project_id: input.projectId,
    role: input.role,
    content: input.content,
    metadata: input.metadata || {},
  });
  if (error) {
    if (isMissingRelation(error)) return;
    throw error;
  }
  await animeSupabase
    .from('director_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.conversationId)
    .eq('user_id', input.userId);
}

export async function clearDirectorConversation(
  fastify: FastifyInstance,
  userId: string,
  projectId: string
): Promise<void> {
  const { data } = await animeSupabase
    .from('director_conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('project_id', projectId);
  const ids = (data || []).map((row: Record<string, unknown>) => String(row.id)).filter(Boolean);
  if (ids.length === 0) return;
  await animeSupabase.from('director_messages').delete().in('conversation_id', ids).eq('user_id', userId);
  await animeSupabase.from('director_conversations').update({ summary: null, updated_at: new Date().toISOString() }).in('id', ids).eq('user_id', userId);
}
