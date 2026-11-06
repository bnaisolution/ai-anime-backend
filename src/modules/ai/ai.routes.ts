import { animeSupabase } from '../anime/db/anime.supabase';
import { FastifyInstance } from 'fastify';
import { env } from '../../config/env';
import { checkAndRecordQuota, runExecutionGuard } from '../../security/executionGuard';
import { redactSecrets } from '../../security/permissionEngine';
import { callDynamicModel } from '../../core/ai-brain/modelRouter';
import { buildSmartContext } from '../../core/ai-brain/contextBuilder';
import crypto from 'crypto';

export default async function aiRoutes(fastify: FastifyInstance) {
  fastify.post('/chat', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const startTs = Date.now();
    const auth = request.authContext;
    const body = (request.body as any) || {};
    const userMessage = String(body.message || '').trim();
    const projectId = body.project_id || (request.headers['x-project-id'] as string) || '11111111-1111-1111-1111-111111111111';
    const skillKey = body.skill_key || 'ai_admin';

    if (!userMessage) return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'message is required' }] });

    const quota = await checkAndRecordQuota(fastify, auth.userId, Math.ceil(userMessage.length / 3) + 300);
    if (!quota.allowed) return reply.code(429).send({ status: 'failed', errors: [{ category: 'PROVIDER_RATE_LIMIT', message: quota.reason }] });

    // Build Dynamic Context (RAG + Tools + Skills + App Knowledge)
    const dynamicContext = await buildSmartContext(fastify, auth, userMessage, projectId, skillKey);

    // Fetch compact app context for AI Director
    let appContext = '';
    try {
      const [projRes, charsRes, epsRes] = await Promise.all([
        animeSupabase.from('projects').select('name, story_bible').eq('id', projectId).maybeSingle(),
        animeSupabase.from('characters').select('name, role, initial_status').eq('project_id', projectId).limit(8),
        animeSupabase.from('episodes').select('episode_no, current_state').eq('project_id', projectId).limit(5)
      ]);
      if (projRes.data) {
        const bible = projRes.data.story_bible || {};
        const cast = (charsRes.data || []).map((c: any) => c.name).join(', ') || 'None';
        const eps = (epsRes.data || []).map((e: any) => `Ep${e.episode_no}:${e.current_state}`).join(', ') || 'None';
        appContext = `[APP CONTEXT: Project="${projRes.data.name}", Genre="${bible.genre || 'Anime'}", Cast=[${cast}], Episodes=[${eps}], Current Screen="${body.current_screen || 'studio'}"]`;
      }
    } catch (e) {}

    // Append appContext to userMessage so AI knows
    const finalUserMessage = `${appContext}\nUser: ${userMessage}`;

    const systemPrompt = [
      'You are BNAI Primary AI Brain (v3.1), a professional Hinglish AI.',
      'You have access to various tools and skills. Use the provided context to answer.',
      'Never claim success without evidence.',
      `Active Skill: ${skillKey}`,
      dynamicContext
    ].filter(Boolean).join('\n\n');

    const aiRes = await callDynamicModel(fastify, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: String(redactSecrets(finalUserMessage)).slice(0, 8000) }
    ]);

    if (!aiRes.ok) return reply.code(502).send({ status: 'failed', errors: [{ category: 'MODEL_ERROR', message: 'All AI providers failed' }] });

    // Log execution
    try {
      await fastify.supabase.from('execution_records').insert({
        execution_type: 'fast_chat_rag',
        provider: aiRes.provider,
        model: aiRes.model,
        input: { request_id: body.request_id, skill_key: skillKey },
        output: { reply_length: aiRes.reply.length },
        success: true,
        duration_ms: Date.now() - startTs,
        tokens_used: aiRes.tokensUsed
      });
    } catch (_e) {}

    return reply.send({
      request_id: body.request_id || crypto.randomUUID(),
      status: 'completed',
      reply: aiRes.reply,
      message: aiRes.reply,
      provider: aiRes.provider,
      model: aiRes.model,
      verification: { status: 'verified', evidence: [`Dynamic path via ${aiRes.provider}`] }
    });
  });

  // Internal Chat for n8n
  fastify.post('/internal/chat', { preHandler: [fastify.authenticateService] }, async (request, reply) => {
    const body = (request.body as any) || {};
    const prompt = (body.prompt || '').trim();
    if (!prompt) return reply.code(400).send({ error: 'prompt is required' });

    const aiRes = await callDynamicModel(fastify, [
      { role: 'system', content: body.systemPrompt || 'You are a helpful AI assistant.' },
      { role: 'user', content: String(redactSecrets(prompt)).slice(0, 16000) }
    ]);

    if (!aiRes.ok) return reply.code(502).send({ error: 'AI providers unavailable' });
    return reply.send({ reply: aiRes.reply, provider: aiRes.provider, model: aiRes.model });
  });

  // Gateway Execution
  fastify.post('/execute', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const auth = request.authContext;
    const body = (request.body as any) || {};
    const requestId = (body.request_id || crypto.randomUUID()).trim();
    const intent = (body.intent || '').trim().toUpperCase();
    const projectId = body.project_id || (request.headers['x-project-id'] as string) || '11111111-1111-1111-1111-111111111111';
    const conversationId = body.conversation_id || null;
    const sourceMode = body.source_mode || 'manual';
    const payload = (body.payload || {}) as Record<string, unknown>;

    const guard = await runExecutionGuard(fastify, auth, intent, projectId, payload);
    if (!guard.ok) return reply.code(guard.httpStatus).send({
      request_id: requestId, task_id: null, status: 'failed', result: null,
      errors: [{ category: guard.category || 'FORBIDDEN', message: guard.message || 'Blocked' }],
      warnings: [], verification: { status: 'not_verified', evidence: ['Rejected by Guard'] }
    });

    const wf00Body = {
      request_id: requestId, user_id: auth.userId, workspace_id: auth.workspaceId,
      project_id: projectId, conversation_id: conversationId, intent, source_mode: sourceMode,
      payload: redactSecrets(payload)
    };

    try {
      const wf00Url = `${env.N8N_BASE_URL}/webhook/wf00-gateway`;
      const n8nResp = await fetch(wf00Url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-service-token': env.N8N_WEBHOOK_SECRET },
        body: JSON.stringify(wf00Body)
      });
      const rawText = await n8nResp.text();
      let parsed: any = null; try { parsed = JSON.parse(rawText); } catch (_e) {}

      if (parsed && parsed.request_id) return reply.code(n8nResp.status).send(parsed);

      return reply.code(n8nResp.ok ? 200 : 502).send({
        request_id: requestId, task_id: null, status: n8nResp.ok ? 'completed' : 'failed',
        result: parsed || { raw: rawText.slice(0, 1000) },
        errors: n8nResp.ok ? [] : [{ category: 'INTEGRATION_UNAVAILABLE', message: `WF-00 HTTP ${n8nResp.status}` }],
        warnings: [], verification: { status: n8nResp.ok ? 'verified' : 'not_verified', evidence: [`Dispatched to WF-00`] }
      });
    } catch (err: any) {
      return reply.code(503).send({ request_id: requestId, status: 'failed', result: null, errors: [{ category: 'INTEGRATION_UNAVAILABLE', message: err.message }], warnings: [], verification: { status: 'not_verified', evidence: [] } });
    }
  });
}
