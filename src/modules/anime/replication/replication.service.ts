import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';

export interface ReplicationTargetStatus {
  configured: boolean;
  healthy: 'healthy' | 'degraded' | 'unknown' | 'not_configured';
  provider: string | null;
  lag_seconds: number | null;
}

export interface ReplicationStatus {
  mode: string;
  configured: boolean;
  primary: ReplicationTargetStatus;
  secondary: ReplicationTargetStatus;
  failover_supported: boolean;
  consistency?: 'consistent' | 'inconsistent' | 'unknown';
  last_checked_at: string;
  rpo_target: string;
  rto_target: string;
}

export interface ReplicationAdapter {
  readonly mode: string;
  status(): Promise<ReplicationStatus>;
  failover(input: { confirmed: boolean; requestedBy: string }): Promise<{ ok: boolean; simulated: boolean; message: string }>;
}

function unknownTarget(): ReplicationTargetStatus {
  return { configured: false, healthy: 'not_configured', provider: null, lag_seconds: null };
}

class NoneReplicationAdapter implements ReplicationAdapter {
  readonly mode = 'none';

  async status(): Promise<ReplicationStatus> {
    return {
      mode: this.mode,
      configured: false,
      primary: unknownTarget(),
      secondary: unknownTarget(),
      failover_supported: false,
      last_checked_at: new Date().toISOString(),
      rpo_target: '24 hours',
      rto_target: '2 hours',
    };
  }

  async failover(): Promise<{ ok: boolean; simulated: boolean; message: string }> {
    throw new AnimeError({
      code: AnimeErrorCode.REPLICATION_NOT_CONFIGURED,
      message: 'No secondary database is configured. Failover was not executed.',
    });
  }
}

class MockReplicationAdapter implements ReplicationAdapter {
  readonly mode = 'mock';

  async status(): Promise<ReplicationStatus> {
    return {
      mode: this.mode,
      configured: true,
      primary: { configured: true, healthy: 'healthy', provider: 'mock-primary', lag_seconds: 0 },
      secondary: { configured: true, healthy: 'healthy', provider: 'mock-secondary', lag_seconds: 1 },
      failover_supported: true,
      last_checked_at: new Date().toISOString(),
      rpo_target: '24 hours',
      rto_target: '2 hours',
    };
  }

  async failover(input: { confirmed: boolean; requestedBy: string }): Promise<{ ok: boolean; simulated: boolean; message: string }> {
    if (!input.confirmed) {
      throw new AnimeError({ code: AnimeErrorCode.MANUAL_REVIEW_REQUIRED, message: 'Failover requires explicit confirmation.' });
    }
    return {
      ok: true,
      simulated: true,
      message: `Mock failover accepted for ${input.requestedBy}. No production database was changed.`,
    };
  }
}

interface EndpointConfig {
  health_url: string;
  lag_url: string | null;
  consistency_url: string | null;
  provider: string | null;
  token: string | null;
}

interface ProbedTarget extends ReplicationTargetStatus {
  consistency_token: string | null;
}

function safeEndpoint(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AnimeError({ code: AnimeErrorCode.REPLICATION_NOT_CONFIGURED, message: `${field} is required.` });
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new AnimeError({ code: AnimeErrorCode.REPLICATION_NOT_CONFIGURED, message: `${field} must be a valid URL.` }); }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new AnimeError({ code: AnimeErrorCode.REPLICATION_NOT_CONFIGURED, message: `${field} must use HTTPS outside local development.` });
  }
  return value;
}

function parseEndpoint(envName: string): EndpointConfig | null {
  const raw = process.env[envName];
  if (!raw) return null;
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { throw new AnimeError({ code: AnimeErrorCode.REPLICATION_NOT_CONFIGURED, message: `${envName} must be valid JSON.` }); }
  const healthUrl = safeEndpoint(parsed?.health_url, `${envName}.health_url`);
  return {
    health_url: healthUrl,
    lag_url: parsed?.lag_url ? safeEndpoint(parsed.lag_url, `${envName}.lag_url`) : null,
    consistency_url: parsed?.consistency_url ? safeEndpoint(parsed.consistency_url, `${envName}.consistency_url`) : null,
    provider: typeof parsed?.provider === 'string' ? parsed.provider : null,
    token: typeof parsed?.token === 'string' && parsed.token.trim() ? parsed.token.trim() : null,
  };
}

function maxLagSeconds(): number {
  const value = Number(process.env.ANIME_REPLICATION_MAX_LAG_SECONDS || 300);
  return Number.isFinite(value) && value >= 0 ? value : 300;
}

async function fetchJson(url: string, token: string | null): Promise<{ ok: boolean; body: any; headers: Headers }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: token ? { authorization: `Bearer ${token}` } : {} });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, body, headers: response.headers };
  } finally {
    clearTimeout(timer);
  }
}

async function probeTarget(config: EndpointConfig | null): Promise<ProbedTarget> {
  if (!config) return { ...unknownTarget(), consistency_token: null };
  try {
    const health = await fetchJson(config.health_url, config.token);
    let lag: number | null = null;
    const headerLag = health.headers.get('x-replication-lag-seconds');
    if (headerLag !== null) lag = Number(headerLag);
    if (config.lag_url) {
      const lagResult = await fetchJson(config.lag_url, config.token);
      if (Number.isFinite(Number(lagResult.body?.lag_seconds))) lag = Number(lagResult.body.lag_seconds);
    } else if (Number.isFinite(Number(health.body?.lag_seconds))) {
      lag = Number(health.body.lag_seconds);
    }
    let consistencyToken = typeof health.body?.consistency_token === 'string' ? health.body.consistency_token : null;
    if (config.consistency_url) {
      const consistency = await fetchJson(config.consistency_url, config.token);
      consistencyToken = typeof consistency.body?.token === 'string' ? consistency.body.token : null;
    }
    const healthy = health.ok && (lag === null || lag <= maxLagSeconds()) ? 'healthy' : 'degraded';
    return {
      configured: true,
      healthy,
      provider: config.provider ?? (typeof health.body?.provider === 'string' ? health.body.provider : null),
      lag_seconds: lag,
      consistency_token: consistencyToken,
    };
  } catch {
    return { configured: true, healthy: 'degraded', provider: config.provider, lag_seconds: null, consistency_token: null };
  }
}

class HttpReplicationAdapter implements ReplicationAdapter {
  readonly mode = 'http';

  async status(): Promise<ReplicationStatus> {
    const primaryConfig = parseEndpoint('ANIME_REPLICATION_PRIMARY');
    const secondaryConfig = parseEndpoint('ANIME_REPLICATION_SECONDARY');
    const primary = await probeTarget(primaryConfig);
    const secondary = await probeTarget(secondaryConfig);
    const consistency: ReplicationStatus['consistency'] = primary.consistency_token && secondary.consistency_token
      ? (primary.consistency_token === secondary.consistency_token ? 'consistent' : 'inconsistent')
      : 'unknown';
    const failoverUrl = process.env.ANIME_REPLICATION_FAILOVER_URL;
    return {
      mode: this.mode,
      configured: Boolean(primaryConfig),
      primary: { configured: primary.configured, healthy: primary.healthy, provider: primary.provider, lag_seconds: primary.lag_seconds },
      secondary: { configured: secondary.configured, healthy: secondary.healthy, provider: secondary.provider, lag_seconds: secondary.lag_seconds },
      failover_supported: Boolean(secondaryConfig && failoverUrl && consistency !== 'inconsistent'),
      consistency,
      last_checked_at: new Date().toISOString(),
      rpo_target: process.env.ANIME_REPLICATION_RPO_TARGET || '24 hours',
      rto_target: process.env.ANIME_REPLICATION_RTO_TARGET || '2 hours',
    };
  }

  async failover(input: { confirmed: boolean; requestedBy: string }): Promise<{ ok: boolean; simulated: boolean; message: string }> {
    if (!input.confirmed) {
      throw new AnimeError({ code: AnimeErrorCode.MANUAL_REVIEW_REQUIRED, message: 'Failover requires explicit confirmation.' });
    }
    const failoverUrl = process.env.ANIME_REPLICATION_FAILOVER_URL;
    if (!failoverUrl) {
      throw new AnimeError({ code: AnimeErrorCode.REPLICATION_NOT_CONFIGURED, message: 'No failover controller is configured. Failover was not executed.' });
    }
    const status = await this.status();
    if (!status.secondary.configured || status.secondary.healthy !== 'healthy') {
      throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'Secondary database is not healthy. Failover was not executed.' });
    }
    if (status.consistency === 'inconsistent') {
      throw new AnimeError({ code: AnimeErrorCode.MANUAL_REVIEW_REQUIRED, message: 'Primary and secondary consistency tokens differ. Failover was not executed.' });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const token = process.env.ANIME_REPLICATION_FAILOVER_TOKEN;
      const response = await fetch(safeEndpoint(failoverUrl, 'ANIME_REPLICATION_FAILOVER_URL'), {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ requested_by: input.requestedBy, confirmed: true }),
      });
      if (!response.ok) {
        throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: `Failover controller rejected the request with HTTP ${response.status}.` });
      }
      return { ok: true, simulated: false, message: 'Failover request accepted by the configured replication controller.' };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function getReplicationAdapter(): ReplicationAdapter {
  const mode = String(process.env.ANIME_REPLICATION_MODE || 'none').toLowerCase();
  if (mode === 'mock') return new MockReplicationAdapter();
  if (mode === 'http' || process.env.ANIME_REPLICATION_PRIMARY) return new HttpReplicationAdapter();
  return new NoneReplicationAdapter();
}
