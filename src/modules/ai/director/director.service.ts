import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { AuthContext } from '../../../plugins/auth';
import { checkAndRecordQuota } from '../../../security/executionGuard';
import { redactSecrets } from '../../../security/permissionEngine';
import { byodFailureMessage, callByodModel } from '../../../core/ai-brain/modelRouter';
import { resolveByodProviderCandidates } from '../../../core/ai-brain/providerResolver';
import { submitAnimeCommand } from '../../anime/commands/commands.service';
import { refreshChannelsForPublish } from '../../anime/publish/publish.service';
import { buildActionProposal, extractStructuredDirectorAction, isMutatingDirectorIntent, verifyDirectorActionToken, type RequestedDirectorAction } from './director.actions';
import { buildDirectorContext, compactDirectorContext } from './director.context';
import { buildDirectorReadiness, missingResourcesFor } from './director.readiness';
import { updateProjectFromSetup } from '../../anime/reads/project.setup.service';
import { recordDirectorAudit, listDirectorAudit } from './director.audit';
import { loadDirectorAttachments, attachmentPromptBlock } from './director.attachments';
import { directorActionPromptCatalog, roleSatisfiesIntent } from './director.capabilities';
import { flags } from '../../../config/flags';
import { incrementCounter, observeHistogram } from '../../anime/observability/metrics';
import {
  appendDirectorMessage,
  ensureDirectorConversation,
  loadConversationSummary,
  loadDirectorMessages,
  summarizeConversationIfNeeded,
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
  attachmentIds?: string[] | null;
  requestedAction?: RequestedDirectorAction | null;
}

function directorSystemPrompt(context: Awaited<ReturnType<typeof buildDirectorContext>>): string {
  return [
    'You are BNAI AI Studio Director, a professional film-production director for anime production.',
    'Answer in the user\'s language (Hindi, Hinglish, or English). Be concise, concrete, and production-focused.',
    'Use ONLY the supplied project context. Never invent project facts, canon, characters, episode numbers, or completed work.',
    'Follow this onboarding order strictly: 1) BYOD/SaaS setup, 2) project settings, 3) Story Bible draft and explicit user approval, 4) characters/cast, 5) production.',
    'Before proposing any production action, inspect context.setup.project.ready_for_production. If it is false, do not propose production; explain the exact missing setup step and the deep link instead.',
    'Project settings live on their existing separate screen. You may propose UPDATE_PROJECT_SETTINGS with only the changed fields, but never claim the change is saved until execution evidence exists. If the user lacks context.access.can_manage_settings, tell them to make the change themselves.',
    'If the user asks for a change and context.access.can_edit is false, tell them they do not have edit access and must make the change themselves or ask an editor/owner.',
    'The target episode duration is authoritative. The project default is a fallback, never a silent replacement for an explicit target.',
    'You do not execute actions in chat. The server issues server-signed action proposals separately. Never claim that a command, render, QC run, or publish has started unless execution evidence is present.',
    'Never reveal internal workflow identifiers, service tokens, provider keys, or infrastructure credentials.',
    context.workflow_ids_visible ? 'The current user is an owner admin, but still do not reveal secrets.' : 'Strictly hide all internal workflow IDs.',
    'If BYOD resources are missing or unhealthy, explain exactly what the user must configure instead of suggesting platform keys.',
    'When the user asks to perform production work, describe the exact action and ask them to confirm the Action Card. Do not simulate success.',
    'If and only if a concrete production action is required, append exactly one structured block and nothing after it:',
    '<director_actions>{"intent":"CONTINUE_EPISODE","season_no":1,"episode_no":2,"target_duration_sec":1440,"payload":{},"mode":"SAVE"}</director_actions>',
    'Allowed structured intents (the only values the server accepts):',
    directorActionPromptCatalog(),
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
    projectRole,
  });

  const conversationId = await ensureDirectorConversation(fastify, auth.userId, input.projectId, input.conversationId);
  let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  try {
    history = await loadDirectorMessages(fastify, auth.userId, conversationId, 10);
  } catch (error) {
    fastify.log.warn({ err: error }, 'Director conversation history unavailable');
  }
  const conversationSummary = await loadConversationSummary(auth.userId, conversationId);
  const attachments = await loadDirectorAttachments(auth.userId, input.projectId, input.attachmentIds || []);
  const userContent = `${message}${attachmentPromptBlock(attachments)}`;

  await appendDirectorMessage(fastify, {
    conversationId,
    userId: auth.userId,
    projectId: input.projectId,
    role: 'user',
    content: message,
    metadata: {
      current_screen: input.currentScreen || null,
      context_version: context.context_version,
      attachment_ids: attachments.map((attachment) => attachment.id),
    },
  }).catch((error) => fastify.log.warn({ err: error }, 'Director user message persistence failed'));

  const aiRes = await callByodModel(
    fastify,
    auth.userId,
    [
      { role: 'system', content: directorSystemPrompt(context) },
      ...(conversationSummary
        ? [{ role: 'system' as const, content: `Conversation summary so far:\n${conversationSummary}` }]
        : []),
      ...history.map((item) => ({ role: item.role, content: item.content })),
      { role: 'user', content: userContent },
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

  void summarizeConversationIfNeeded(fastify, auth.userId, conversationId)
    .catch((error) => fastify.log.warn({ err: error }, 'Director conversation summary failed'));

  const actions = [];
  let actionError: string | null = null;
  const requestedAction = input.requestedAction || structuredAction.requested;
  if (requestedAction) {
    const requestedIntent = String(requestedAction.intent || '').toUpperCase();
    if (!roleSatisfiesIntent(requestedIntent, projectRole)) {
      actionError = `Your project role (${projectRole}) cannot make this change. Please make it yourself from the relevant project screen, or ask an editor/owner.`;
    } else if (!isMutatingDirectorIntent(requestedIntent as any)) {
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
  if (actionError) {
    await recordDirectorAudit({
      userId: auth.userId,
      projectId: input.projectId,
      conversationId,
      actionId: `blocked:${String(requestedAction?.intent || 'unknown').toUpperCase()}`,
      intent: String(requestedAction?.intent || 'unknown').toUpperCase(),
      status: 'blocked',
      requestId,
      reason: actionError,
      payload: requestedAction?.payload || null,
    });
  }
  for (const action of actions) {
    await recordDirectorAudit({
      userId: auth.userId,
      projectId: input.projectId,
      conversationId,
      actionId: action.action_id,
      intent: action.intent,
      status: 'proposed',
      requestId,
      payload: action.preview?.payload || null,
    });
  }
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
  if (action.intent === 'UPDATE_PROJECT_SETTINGS') {
    try {
      const updated = await updateProjectFromSetup({
        userId: auth.userId,
        projectId: input.projectId,
        input: action.payload as Record<string, unknown>,
      });
      await recordDirectorAudit({
        userId: auth.userId,
        projectId: input.projectId,
        actionId: input.actionId,
        intent: action.intent,
        status: 'executed',
        commandId: `settings:${action.nonce}`,
        requestId: input.requestId || null,
        payload: action.payload,
      });
      return {
        action_id: input.actionId,
        intent: action.intent,
        command_id: `settings:${action.nonce}`,
        status: String(updated?.story_bible?.project_status || 'UPDATED'),
        idempotent_replay: false,
      };
    } catch (error) {
      await recordDirectorAudit({
        userId: auth.userId,
        projectId: input.projectId,
        actionId: input.actionId,
        intent: action.intent,
        status: 'failed',
        requestId: input.requestId || null,
        reason: error instanceof Error ? error.message : 'Project settings update failed',
        payload: action.payload,
      });
      throw error;
    }
  }
  const productionIntents = new Set([
    'GENERATE_EPISODE',
    'CONTINUE_EPISODE',
    'REGENERATE_EPISODE',
    'RUN_QC',
    'PUBLISH_NOW',
  ]);
  if (action.target_duration_sec > 0 || productionIntents.has(action.intent)) {
    const context = await buildDirectorContext(fastify, auth, {
      projectId: input.projectId,
      explicitSeasonNo: action.season_no,
      explicitEpisodeNo: action.episode_no,
      explicitTargetDurationSec: action.target_duration_sec,
    });
    if (action.target_duration_sec > 0 && context.context_version !== action.context_version) {
      throw Object.assign(new Error('Project context changed after this action was proposed. Ask AI Director for a fresh action.'), { code: 'CONTEXT_STALE' });
    }
    if (productionIntents.has(action.intent) && !context.setup.project?.ready_for_production) {
      const missing = [
        ...context.setup.byod.missing,
        ...(context.setup.project?.missing_settings || []),
      ];
      await recordDirectorAudit({
        userId: auth.userId,
        projectId: input.projectId,
        actionId: input.actionId,
        intent: action.intent,
        status: 'blocked',
        requestId: input.requestId || null,
        reason: `SETUP_REQUIRED: ${context.setup.next_step}`,
        payload: action.payload,
      });
      throw Object.assign(
        new Error(`Finish ${context.setup.next_step.replaceAll('_', ' ')} before production.`),
        { code: 'SETUP_REQUIRED', missing, next_step: context.setup.next_step, deep_link: context.setup.deep_link }
      );
    }
  }

  const idempotencyKey = String(input.idempotencyKey || '').trim() || `director:${action.nonce}`;
  if (flags.byodFailClosed) {
    const readiness = await buildDirectorReadiness(fastify, auth, input.projectId);
    const missing = missingResourcesFor(readiness, action.intent);
    if (missing.length > 0) {
      await recordDirectorAudit({
        userId: auth.userId,
        projectId: input.projectId,
        actionId: input.actionId,
        intent: action.intent,
        status: 'blocked',
        requestId: input.requestId || null,
        reason: `SETUP_REQUIRED: ${missing.join(', ')}`,
        payload: action.payload,
      });
      throw Object.assign(
        new Error(`Setup required before this action: ${missing.join(', ')}.`),
        { code: 'SETUP_REQUIRED', missing }
      );
    }
  }
  incrementCounter('ai_director_action_executions_total', { intent: action.intent });
  if (action.intent === 'PUBLISH_NOW' && flags.publishOauthV2) {
    const rawPlatforms = (action.payload as Record<string, unknown>).publish_platforms;
    const requestedPlatforms = Array.isArray(rawPlatforms)
      ? rawPlatforms.map((platform) => String(platform || '').toLowerCase()).filter(Boolean)
      : ['youtube'];
    const readiness = await buildDirectorReadiness(fastify, auth, input.projectId);
    const known: Record<string, string> = { youtube: 'youtube', instagram: 'instagram' };
    const missingChannels = requestedPlatforms
      .filter((platform) => known[platform])
      .filter((platform) => readiness.resources[known[platform] as 'youtube' | 'instagram'].status === 'missing');
    if (missingChannels.length > 0) {
      await recordDirectorAudit({
        userId: auth.userId,
        projectId: input.projectId,
        actionId: input.actionId,
        intent: action.intent,
        status: 'blocked',
        requestId: input.requestId || null,
        reason: `SETUP_REQUIRED: ${missingChannels.join(', ')}`,
        payload: action.payload,
      });
      throw Object.assign(
        new Error(`Connect these publishing channels first: ${missingChannels.join(', ')}.`),
        { code: 'SETUP_REQUIRED', missing: missingChannels }
      );
    }
    const refreshed = await refreshChannelsForPublish(auth.userId, requestedPlatforms);
    if (refreshed.failed.length > 0) {
      await recordDirectorAudit({
        userId: auth.userId,
        projectId: input.projectId,
        actionId: input.actionId,
        intent: action.intent,
        status: 'blocked',
        requestId: input.requestId || null,
        reason: `CHANNEL_EXPIRED: ${refreshed.failed.map((item) => item.platform).join(', ')}`,
        payload: action.payload,
      });
      throw Object.assign(
        new Error('Publishing authorization expired. Reconnect the channel from Publish Studio and retry.'),
        {
          code: 'CHANNEL_EXPIRED',
          failed: refreshed.failed.map((item) => item.platform),
        }
      );
    }
  }
  let result: Awaited<ReturnType<typeof submitAnimeCommand>>;
  try {
    result = await submitAnimeCommand({
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
  } catch (error) {
    await recordDirectorAudit({
      userId: auth.userId,
      projectId: input.projectId,
      actionId: input.actionId,
      intent: action.intent,
      status: 'failed',
      requestId: input.requestId || null,
      reason: error instanceof Error ? error.message : 'Command submission failed',
      payload: action.payload,
    });
    throw error;
  }

  await recordDirectorAudit({
    userId: auth.userId,
    projectId: input.projectId,
    actionId: input.actionId,
    intent: action.intent,
    status: 'executed',
    commandId: String(result.command.id),
    requestId: input.requestId || null,
    payload: action.payload,
  });

  return {
    action_id: input.actionId,
    intent: action.intent,
    command_id: String(result.command.id),
    status: String(result.command.status),
    idempotent_replay: Boolean(result.idempotent_replay),
  };
}
