import { createHmac } from 'node:crypto';
import { animeEnv } from '../config/anime.env';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export function computeN8nHmacSignature(timestampSec: string, rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`, 'utf8').digest('hex')}`;
}
function resolveWf00WebhookUrl(): string {
  const explicitUrl = process.env.WF_00_WEBHOOK_URL?.trim();
  if (explicitUrl) return explicitUrl;
  const baseUrl = (process.env.N8N_BASE_URL || '').trim().replace(/\/+$/, '');
  if (baseUrl) return `${baseUrl}/webhook/api/v1/router`;
  throw new AnimeError({ code: AnimeErrorCode.INTERNAL, message: 'WF_00_WEBHOOK_URL missing.', retryable: false });
}
export async function dispatchToWf00(envelope: any, timeoutMs = 45000): Promise<any> {
  const targetUrl = resolveWf00WebhookUrl();
  const timestampSec = Math.floor(Date.now() / 1000).toString();
  const wirePayload = { ...envelope, project_id: envelope.project_id, intent: envelope.intent, mode: envelope.mode ?? 'QUICK', episode_no: envelope.episode_no ?? 1, episode_number: envelope.episode_no ?? 1, season_no: envelope.season_no ?? 1, userPrompt: envelope.userPrompt ?? envelope.user_prompt ?? envelope.payload?.prompt ?? '', user_prompt: envelope.user_prompt ?? envelope.userPrompt ?? envelope.payload?.prompt ?? '', project_style: envelope.project_style ?? envelope.payload?.project_style ?? { visual_style: 'ANIME' }, user_infrastructure: envelope.user_infrastructure ?? envelope.payload?.user_infrastructure ?? {}, sessionId: `cmd_${envelope.command_id}` };
  const rawBody = JSON.stringify(wirePayload);
  const signature = computeN8nHmacSignature(timestampSec, rawBody, animeEnv.ANIME_N8N_CALLBACK_SECRET);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(targetUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Project-Id': envelope.project_id, 'X-Anime-Timestamp': timestampSec, 'X-Anime-Signature': signature, 'X-Request-Id': envelope.request_id || envelope.command_id, 'Idempotency-Key': envelope.idempotency_key || envelope.command_id }, body: rawBody, signal: controller.signal });
    if (!response.ok) throw new AnimeError({ code: response.status >= 500 ? AnimeErrorCode.PROVIDER_UNAVAILABLE : AnimeErrorCode.WORKFLOW_CONTRACT_MISMATCH, message: `HTTP ${response.status} from n8n WF-00`, retryable: response.status >= 500 || response.status === 429 });
    const rawText = await response.text();
    let parsed: any = {};
    try { parsed = rawText ? JSON.parse(rawText) : {}; } catch (_e) { parsed = { output: rawText }; }
    return { ok: parsed?.ok !== false, status: parsed?.status || 'ACKNOWLEDGED', execution_id: parsed?.execution_id || null, raw: parsed };
  } catch (err: any) {
    if (err instanceof AnimeError) throw err;
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: err?.message || 'n8n dispatch failed', retryable: true });
  } finally { clearTimeout(timer); }
}
