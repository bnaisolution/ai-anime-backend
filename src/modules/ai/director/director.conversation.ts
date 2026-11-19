import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { animeSupabase } from '../../anime/db/anime.supabase';
import { callByodModel } from '../../../core/ai-brain/modelRouter';

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

export async function loadConversationSummary(
  userId: string,
  conversationId: string
): Promise<string | null> {
  try {
    const { data, error } = await animeSupabase
      .from('director_conversations')
      .select('summary')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return null;
    const summary = String((data as Record<string, unknown> | null)?.summary || '').trim();
    return summary || null;
  } catch {
    return null;
  }
}

const SUMMARY_MIN_MESSAGES = 20;
const SUMMARY_BATCH = 10;
const SUMMARY_MAX_CHARS = 2_500;

export async function summarizeConversationIfNeeded(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string
): Promise<void> {
  try {
    const { data: meta, error: metaError } = await animeSupabase
      .from('director_conversations')
      .select('summary, summary_message_count')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (metaError || !meta) return;

    const { count, error: countError } = await animeSupabase
      .from('director_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
    if (countError || count == null) return;
    const total = Number(count);
    const summarized = Number((meta as Record<string, unknown>).summary_message_count || 0);
    if (total < SUMMARY_MIN_MESSAGES || total - summarized < SUMMARY_BATCH) return;

    const { data: rows } = await animeSupabase
      .from('director_messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(40);
    const messages = (rows || []).reverse();
    if (messages.length === 0) return;

    let transcript = messages
      .map((row: Record<string, unknown>) => {
        const role = row.role === 'assistant' ? 'Director' : 'User';
        return `${role}: ${String(row.content || '').slice(0, 1_500)}`;
      })
      .join('\n');
    if (transcript.length > 12_000) transcript = transcript.slice(-12_000);

    const previous = String((meta as Record<string, unknown>).summary || '').trim();
    const aiRes = await callByodModel(
      fastify,
      userId,
      [
        {
          role: 'system',
          content: 'You compress an anime production conversation into durable context. Keep canon decisions, episode targets, approved actions, open questions and user preferences. Do not invent facts. Reply with plain text only, maximum 1800 characters.',
        },
        {
          role: 'user',
          content: `${previous ? `Previous summary:\n${previous}\n\n` : ''}Conversation transcript:\n${transcript}`,
        },
      ],
      0.1
    );
    if (!aiRes.ok) return;
    const summary = String(aiRes.reply || '').trim().slice(0, SUMMARY_MAX_CHARS);
    if (!summary) return;

    await animeSupabase
      .from('director_conversations')
      .update({
        summary,
        summary_message_count: total,
        summary_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('user_id', userId);
  } catch {
    /* Summaries are best-effort and must never block chat. */
  }
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
