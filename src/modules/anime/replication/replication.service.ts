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

export function getReplicationAdapter(): ReplicationAdapter {
  const mode = String(process.env.ANIME_REPLICATION_MODE || 'none').toLowerCase();
  if (mode === 'mock') return new MockReplicationAdapter();
  return new NoneReplicationAdapter();
}
