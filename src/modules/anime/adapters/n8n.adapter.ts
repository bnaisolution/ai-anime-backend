import { createHmac } from 'node:crypto';
import { animeEnv } from '../config/anime.env';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import type {
  CommandIntent,
  ExecutionMode,
  ProjectStyleConfig,
  UserInfrastructureConfig,
  WorkflowKey,
} from '../commands/commands.types';

export interface N8nDispatchEnvelope {
  readonly command_id: string;
  readonly project_id: string;
  readonly user_id: string;
  readonly intent: CommandIntent;
  readonly wf_key: WorkflowKey;
  readonly mode: ExecutionMode;
  readonly episode_no?: number | null;
  readonly episode_number?: number | null;
  readonly season_no?: number | null;
  readonly userPrompt?: string;
  readonly user_prompt?: string;
  readonly project_style?: ProjectStyleConfig;
  readonly user_infrastructure?: UserInfrastructureConfig;
  readonly idempotency_key: string;
  readonly request_id: string;
  readonly payload: Record<string, unknown>;
}

export interface N8nDispatchResult {
  readonly ok: boolean;
  readonly status: string;
  readonly execution_id: string | null;
  readonly raw: Record<string, unknown>;
}

export function computeN8nHmacSignature(
  timestampSec: string,
  rawBody: string,
  secret: string
): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(`${timestampSec}.${rawBody}`, 'utf8');
  return `sha256=${hmac.digest('hex')}`;
}

function resolveWf00WebhookUrl(): string {
  const explicitUrl = process.env.WF_00_WEBHOOK_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }
  const baseUrl = process.env.N8N_BASE_URL?.trim();
  if (baseUrl) {
    return `${baseUrl.replace(/\/+$/, '')}/webhook/api/v1/router`;
  }
  throw new AnimeError({
    code: AnimeErrorCode.INTERNAL,
    message: 'WF_00_WEBHOOK_URL (or N8N_BASE_URL) is not configured in environment variables.',
    retryable: false,
  });
}

export async function dispatchToWf00(
  envelope: N8nDispatchEnvelope,
  timeoutMs = 30000
): Promise<N8nDispatchResult> {
  const targetUrl = resolveWf00WebhookUrl();
  const timestampSec = Math.floor(Date.now() / 1000).toString();

  const wirePayload = {
    ...envelope,
    project_id: envelope.project_id,
    intent: envelope.intent,
    mode: envelope.mode,
    episode_no: envelope.episode_no ?? 1,
    episode_number: envelope.episode_no ?? 1,
    season_no: envelope.season_no ?? 1,
    userPrompt: envelope.userPrompt ?? envelope.user_prompt ?? '',
    user_prompt: envelope.user_prompt ?? envelope.userPrompt ?? '',
    project_style: envelope.project_style ?? { visual_style: 'ANIME' },
    user_infrastructure: envelope.user_infrastructure ?? {},
    sessionId: `cmd_${envelope.command_id}`,
  };

  const rawBody = JSON.stringify(wirePayload);
  const signature = computeN8nHmacSignature(
    timestampSec,
    rawBody,
    animeEnv.ANIME_N8N_CALLBACK_SECRET
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Id': envelope.project_id,
        'X-Anime-Timestamp': timestampSec,
        'X-Anime-Signature': signature,
        'X-Request-Id': envelope.request_id,
        'Idempotency-Key': envelope.idempotency_key,
      },
      body: rawBody,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AnimeError({
        code:
          response.status >= 500
            ? AnimeErrorCode.PROVIDER_UNAVAILABLE
            : AnimeErrorCode.WORKFLOW_CONTRACT_MISMATCH,
        message: `n8n WF-00 webhook returned HTTP ${response.status}`,
        retryable: response.status >= 500 || response.status === 429,
      });
    }

    const parsed = (await response.json()) as Record<string, unknown>;
    const executionId =
      typeof parsed.execution_id === 'string' ? parsed.execution_id : null;
    const status =
      typeof parsed.status === 'string' ? parsed.status : 'ACKNOWLEDGED';

    return {
      ok: Boolean(parsed.ok ?? true),
      status,
      execution_id: executionId,
      raw: parsed,
    };
  } catch (err: unknown) {
    if (err instanceof AnimeError) {
      throw err;
    }
    throw new AnimeError({
      code: AnimeErrorCode.PROVIDER_UNAVAILABLE,
      message:
        err instanceof Error
          ? `Failed to dispatch command to n8n WF-00: ${err.message}`
          : 'Failed to dispatch command to n8n WF-00',
      retryable: true,
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }
}
