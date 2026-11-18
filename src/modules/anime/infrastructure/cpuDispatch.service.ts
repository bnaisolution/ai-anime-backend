import { getActiveDecryptedInfrastructureForUser, type DecryptedInfrastructure } from './infrastructure.service';

export type CpuTargetKind = 'github_actions' | 'own_cpu' | 'none';

export interface CpuTarget {
  kind: CpuTargetKind;
  workerUrl: string | null;
  repository: string | null;
  workflow: string | null;
  ref: string;
  hasToken: boolean;
  providerId: string | null;
}

export interface CpuTestResult {
  ok: boolean;
  kind: CpuTargetKind;
  latencyMs: number | null;
  status: number | null;
  error: string | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function resolveCpuTarget(userId: string, tenantId?: string): Promise<CpuTarget> {
  let records: DecryptedInfrastructure[] = [];
  try {
    records = await getActiveDecryptedInfrastructureForUser(userId, tenantId);
  } catch {
    records = [];
  }

  const github = records.find((record) => record.provider_type === 'github_actions');
  const ownCpu = records.find((record) => record.provider_type === 'tts' || record.provider_type === 'ffmpeg');
  const custom = records.find((record) => record.provider_type === 'custom');

  if (github) {
    const config = asRecord(github.config);
    const worker = asRecord(config.github_worker);
    const workerUrl = text(config.worker_url) || text(worker.worker_url);
    const repository = text(config.repository) || text(worker.repository);
    const workflow = text(config.workflow) || text(worker.workflow);
    const token = text(config.token) || text(config.github_token) || text(worker.token);
    if (workerUrl || (repository && workflow)) {
      return {
        kind: 'github_actions',
        workerUrl: workerUrl || null,
        repository: repository || null,
        workflow: workflow || null,
        ref: text(config.ref) || 'main',
        hasToken: Boolean(token),
        providerId: github.id,
      };
    }
  }

  if (ownCpu) {
    const config = asRecord(ownCpu.config);
    const workerUrl = text(config.worker_url) || text(config.health_url);
    if (workerUrl) {
      return {
        kind: 'own_cpu',
        workerUrl,
        repository: null,
        workflow: null,
        ref: 'main',
        hasToken: Boolean(text(config.token)),
        providerId: ownCpu.id,
      };
    }
  }

  if (custom) {
    const config = asRecord(custom.config);
    const cpu = asRecord(config.cpu_worker);
    const workerUrl = text(cpu.worker_url) || text(config.cpu_worker_url);
    if (workerUrl) {
      return {
        kind: 'own_cpu',
        workerUrl,
        repository: null,
        workflow: null,
        ref: 'main',
        hasToken: Boolean(text(cpu.token)),
        providerId: custom.id,
      };
    }
  }

  return {
    kind: 'none',
    workerUrl: null,
    repository: null,
    workflow: null,
    ref: 'main',
    hasToken: false,
    providerId: null,
  };
}

export async function testCpuTarget(userId: string, tenantId?: string): Promise<CpuTestResult> {
  const target = await resolveCpuTarget(userId, tenantId);
  if (target.kind === 'none') {
    return { ok: false, kind: 'none', latencyMs: null, status: null, error: 'CPU target is not configured' };
  }
  if (!target.workerUrl) {
    return {
      ok: Boolean(target.repository && target.workflow && target.hasToken),
      kind: target.kind,
      latencyMs: null,
      status: null,
      error: target.hasToken ? null : 'GitHub token is missing',
    };
  }

  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${target.workerUrl.replace(/\/$/, '')}/health`, {
      signal: controller.signal,
      headers: target.hasToken ? { authorization: 'Bearer token' } : {},
    });
    clearTimeout(timer);
    return {
      ok: response.ok,
      kind: target.kind,
      latencyMs: Date.now() - started,
      status: response.status,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      kind: target.kind,
      latencyMs: Date.now() - started,
      status: null,
      error: error instanceof Error ? error.message : 'CPU worker unreachable',
    };
  }
}

export async function dispatchGithubWorkflow(
  userId: string,
  inputs: Record<string, string>,
  tenantId?: string
): Promise<{ ok: boolean; runId: number | null; status: number | null; error: string | null }> {
  const target = await resolveCpuTarget(userId, tenantId);
  if (target.kind !== 'github_actions' || !target.repository || !target.workflow) {
    return { ok: false, runId: null, status: null, error: 'GitHub Actions is not configured' };
  }

  let records: DecryptedInfrastructure[] = [];
  try {
    records = await getActiveDecryptedInfrastructureForUser(userId, tenantId);
  } catch {
    records = [];
  }
  const github = records.find((record) => record.provider_type === 'github_actions');
  const config = asRecord(github?.config);
  const worker = asRecord(config.github_worker);
  const token = text(config.token) || text(config.github_token) || text(worker.token);
  if (!token) {
    return { ok: false, runId: null, status: null, error: 'GitHub token is missing' };
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${target.repository}/actions/workflows/${encodeURIComponent(target.workflow)}/dispatches`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ref: target.ref, inputs }),
      }
    );
    if (!response.ok && response.status !== 204) {
      return { ok: false, runId: null, status: response.status, error: `GitHub dispatch failed (HTTP ${response.status})` };
    }
    return { ok: true, runId: null, status: response.status, error: null };
  } catch (error) {
    return {
      ok: false,
      runId: null,
      status: null,
      error: error instanceof Error ? error.message : 'GitHub dispatch failed',
    };
  }
}

// Kept for backwards compatibility: older callers expect a synchronous token check.
export function cpuTargetBadge(target: CpuTarget): string {
  if (target.kind === 'none') return 'CPU: not configured';
  if (target.kind === 'github_actions') return `CPU: GitHub Actions${target.hasToken ? '' : ' (token missing)'}`;
  return 'CPU: own worker';
}
