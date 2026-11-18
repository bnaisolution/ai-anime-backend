import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { AuthContext } from '../../../plugins/auth';
import { checkAndRecordQuota } from '../../../security/executionGuard';
import { redactSecrets } from '../../../security/permissionEngine';
import { byodFailureMessage, callByodModel } from '../../../core/ai-brain/modelRouter';
import { resolveByodProviderCandidates } from '../../../core/ai-brain/providerResolver';
import { submitAnimeCommand } from '../../anime/commands/commands.service';
import { buildActionProposal, extractStructuredDirectorAction, isMutatingDirectorIntent, verifyDirectorActionToken, type RequestedDirectorAction } from './director.actions';
import { buildDirectorContext, compactDirectorContext } from './director.context';
import { incrementCounter, observeHistogram } from '../../anime/observability/metrics';
import {
  appendDirectorMessage,
  ensureDirectorConversation,
  loadDirectorMessages,
} from './director.conversation';
import type { DirectorActionExecution, DirectorChatResult } from './director.types';

export interface DirectorChatInput {
  message: string;
  projectId: string;
  conversationId?: string | null;
  currentScreen?: string | null;
  explicitSeasonNo?: number | null;
  explicitEpisodeNo?: number | null;
  explicitTargetDurationSec?: number | null;
  requestedAction?: RequestedDirectorAction | null;
}

function directorSystemPrompt(context: Awaited<ReturnType<typeof buildDirectorContext>>): string {
  return [
    'You are BNAI AI Studio Director, a professional film-production director for anime production.',
    'Answer in the user\'s language (Hindi, Hinglish, or English). Be concise, concrete, and production-focused.',
    'Use ONLY the supplied project context. Never invent project facts, canon, characters, episode numbers, or completed work.',
    'The target episode duration is authoritative. The project default is a fallback, never a silent replacement for an explicit target.',
    'You do not execute actions in chat. The server issues server-signed action proposals separately. Never claim that a command, render, QC run, or publish has started unless execution evidence is present.',
    'Never reveal internal workflow identifiers, service tokens, provider keys, or infrastructure credentials.',
    context.workflow_ids_visible ? 'The current user is an owner admin, but still do not reveal secrets.' : 'Strictly hide all internal workflow IDs.',
    'If BYOD resources are missing or unhealthy, explain exactly what the user must configure instead of suggesting platform keys.',
    'When the user asks to perform production work, describe the exact action and ask them to confirm the Action Card. Do not simulate success.',
    'If and only if a concrete production action is required, append exactly one structured block and nothing after it:',
    '<director_actions>{"intent":"CONTINUE_EPISODE","season_no":1,"episode_no":2,"target_duration_sec":1440,"payload":{},"mode":"SAVE"}</director_actions>',
    'Allowed structured intents: SAVE_BIBLE, GENERATE_EPISODE, REGENERATE_EPISODE, CONTINUE_EPISODE, QUICK_GENERATE_REEL, QUICK_GENERATE_IMAGE, QUICK_GENERATE_VIDEO, SAVE_TO_PROJECT, VISION_ANALYSIS, CHANGE_CHARACTER_VOICE, PREVIEW_VOICE, RUN_QC, PUBLISH_NOW, CHECK_CONTINUITY, CHECK_CANON, RETRY_FAILED.',
    'Never put secrets or workflow IDs in the structured block. Never claim the action already ran.',
    '',
    'PROJECT CONTEXT JSON:',
    compactDirectorContext(context),
  ].join('\n');
}

async function recordDirectorExecution(
  fastify: FastifyInstance,
  input: {
    userId: string;
    requestId: string;
    skillKey: string;
    conversationId: string;
    provider: string;
    model: string;
    replyLength: number;
    tokensUsed: number;
    durationMs: number;
    success: boolean;
    error?: string;
  }
): Promise<void> {
  try {
    await fastify.supabase.from('execution_records').insert({
      execution_type: 'ai_director_byod_chat',
      provider: input.provider,
      model: input.model,
      input: {
        user_id: input.userId,
        request_id: input.requestId,
        skill_key: input.skillKey,
        conversation_id: input.conversationId,
        key_source: 'byod',
      },
      output: { reply_length: input.replyLength, error: input.error || null },
      success: input.success,
      duration_ms: input.durationMs,
      tokens_used: input.tokensUsed,
    });
  } catch {
    /* execution records are best-effort observability, never a chat blocker */
  }
}

export async function runDirectorChat(
  fastify: FastifyInstance,
  auth: AuthContext,
  projectRole: string,
  input: DirectorChatInput
): Promise<DirectorChatResult> {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const message = String(input.message || '').trim();
  if (!message) throw Object.assign(new Error('Message is required.'), { code: 'INVALID_INPUT' });

  const resolution = await resolveByodProviderCandidates(auth.userId, { capability: 'text' });
  if (resolution.candidates.length === 0) {
    throw Object.assign(new Error(byodFailureMessage(resolution)), { code: 'BYOD_REQUIRED' });
  }

  const quota = await checkAndRecordQuota(fastify, auth.userId, Math.ceil(message.length / 3) + 600);
  if (!quota.allowed) {
    throw Object.assign(new Error(quota.reason || 'Quota exceeded.'), { code: 'QUOTA_EXCEEDED' });
  }

  const context = await buildDirectorContext(fastify, auth, {
    projectId: input.projectId,
    explicitSeasonNo: input.explicitSeasonNo,
    explicitEpisodeNo: input.explicitEpisodeNo,
    explicitTargetDurationSec: input.explicitTargetDurationSec,
    currentScreen: input.currentScreen,
    memoryQuery: message,
  });

  const conversationId = await ensureDirectorConversation(fastify, auth.userId, input.projectId, input.conversationId);
  let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  try {
    history = await loadDirectorMessages(fastify, auth.userId, conversationId, 10);
  } catch (error) {
    fastify.log.warn({ err: error }, 'Director conversation history unavailable');
  }

  await appendDirectorMessage(fastify, {
    conversationId,
    userId: auth.userId,
    projectId: input.projectId,
    role: 'user',
    content: message,
    metadata: { current_screen: input.currentScreen || null, context_version: context.context_version },
  }).catch((error) => fastify.log.warn({ err: error }, 'Director user message persistence failed'));

  const aiRes = await callByodModel(
    fastify,
    auth.userId,
    [
      { role: 'system', content: directorSystemPrompt(context) },
      ...history.map((item) => ({ role: item.role, content: item.content })),
      { role: 'user', content: message },
    ],
    0.3,
    auth.workspaceId || undefined
  );

  if (!aiRes.ok) {
    await recordDirectorExecution(fastify, {
      userId: auth.userId,
      requestId,
      skillKey: 'cinematic_director',
      conversationId,
      provider: aiRes.provider,
      model: aiRes.model,
      replyLength: 0,
      tokensUsed: 0,
      durationMs: Date.now() - started,
      success: false,
      error: aiRes.reason,
    });
    incrementCounter('ai_director_chat_total', { status: 'failed', provider: aiRes.provider || 'none', error: aiRes.reason || 'unknown' });
    observeHistogram('ai_director_chat_duration_seconds', (Date.now() - started) / 1000, { status: 'failed' });
    throw Object.assign(new Error(byodFailureMessage(aiRes.resolution, aiRes.reason)), { code: 'BYOD_FAILED' });
  }

  const structuredAction = extractStructuredDirectorAction(aiRes.reply);
  const safeReply = String(redactSecrets(structuredAction.reply) || '').trim();
  await appendDirectorMessage(fastify, {
    conversationId,
    userId: auth.userId,
    projectId: input.projectId,
    role: 'assistant',
    content: safeReply,
    metadata: {
      provider: aiRes.provider,
      model: aiRes.model,
      key_source: 'byod',
      context_version: context.context_version,
    },
  }).catch((error) => fastify.log.warn({ err: error }, 'Director assistant message persistence failed'));

  const actions = [];
  let actionError: string | null = null;
  const requestedAction = input.requestedAction || structuredAction.requested;
  if (requestedAction) {
    if (!['owner', 'admin', 'editor'].includes(projectRole)) {
      actionError = 'Your project role is read-only. Ask a project editor or owner to execute this action.';
    } else if (!isMutatingDirectorIntent(String(requestedAction.intent || '').toUpperCase() as any)) {
      actionError = 'The requested action is not available to AI Director.';
    } else {
      try {
        actions.push(buildActionProposal({
          userId: auth.userId,
          projectId: input.projectId,
          contextVersion: context.context_version,
          targetDurationSec: context.target.targetDurationSec,
          requested: requestedAction,
        }));
      } catch (error) {
        actionError = error instanceof Error ? error.message : 'Invalid action request';
      }
    }
  }

  await recordDirectorExecution(fastify, {
    userId: auth.userId,
    requestId,
    skillKey: 'cinematic_director',
    conversationId,
    provider: aiRes.provider,
    model: aiRes.model,
    replyLength: safeReply.length,
    tokensUsed: aiRes.tokensUsed,
    durationMs: Date.now() - started,
    success: true,
  });
  incrementCounter('ai_director_chat_total', { status: 'success', provider: aiRes.provider, error: 'none' });
  incrementCounter('ai_director_actions_proposed_total', { blocked: actionError ? 'true' : 'false' }, actions.length);
  observeHistogram('ai_director_chat_duration_seconds', (Date.now() - started) / 1000, { status: 'success' });

  return {
    request_id: requestId,
    conversation_id: conversationId,
    status: 'completed',
    reply: safeReply,
    message: safeReply,
    provider: aiRes.provider,
    model: aiRes.model,
    key_source: 'byod',
    context,
    actions,
    verification: {
      status: 'verified',
      evidence: [
        `BYOD provider ${aiRes.provider} executed the request`,
        `Context version ${context.context_version}`,
        actionError ? `Action proposal blocked: ${actionError}` : `Actions proposed: ${actions.length}`,
      ],
    },
  };
}

export async function executeDirectorAction(
  fastify: FastifyInstance,
  auth: AuthContext,
  input: {
    actionId: string;
    projectId: string;
    idempotencyKey?: string | null;
    requestId?: string | null;
  }
): Promise<DirectorActionExecution> {
  const action = verifyDirectorActionToken(input.actionId);
  if (action.sub !== auth.userId) {
    throw Object.assign(new Error('Action belongs to another user.'), { code: 'ACTION_FORBIDDEN' });
  }
  if (action.project_id !== input.projectId) {
    throw Object.assign(new Error('Action project does not match the requested project.'), { code: 'ACTION_PROJECT_MISMATCH' });
  }
  if (action.target_duration_sec > 0) {
    const context = await buildDirectorContext(fastify, auth, {
      projectId: input.projectId,
      explicitSeasonNo: action.season_no,
      explicitEpisodeNo: action.episode_no,
      explicitTargetDurationSec: action.target_duration_sec,
    });
    if (context.context_version !== action.context_version) {
      throw Object.assign(new Error('Project context changed after this action was proposed. Ask AI Director for a fresh action.'), { code: 'CONTEXT_STALE' });
    }
  }

  const idempotencyKey = String(input.idempotencyKey || '').trim() || `director:${action.nonce}`;
  incrementCounter('ai_director_action_executions_total', { intent: action.intent });
  const result = await submitAnimeCommand({
    idempotencyKey,
    userId: auth.userId,
    requestId: input.requestId || crypto.randomUUID(),
    body: {
      intent: action.intent,
      project_id: input.projectId,
      payload: {
        ...action.payload,
        target_duration_sec: action.target_duration_sec,
        season_no: action.season_no,
        episode_no: action.episode_no,
        source: 'ai_director_action',
      },
      mode: action.mode || undefined,
      season_no: action.season_no,
      episode_no: action.episode_no,
    } as any,
  });

  return {
    action_id: input.actionId,
    intent: action.intent,
    command_id: String(result.command.id),
    status: String(result.command.status),
    idempotent_replay: Boolean(result.idempotent_replay),
  };
}
