import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import type { ValidatedTenantDsn } from './tenantDatabase.types';

const ALLOWED_SSL_MODES = new Set(['require', 'verify-ca', 'verify-full', 'prefer', 'disable']);

function invalid(message: string): AnimeError {
  return new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message });
}

function privateIpv4(host: string): boolean {
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 0) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function privateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80');
}

function assertHostAllowed(host: string): void {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!normalized) throw invalid('Database host is required.');
  if (normalized === 'localhost' || normalized.endsWith('.local') || normalized.endsWith('.internal')) {
    throw invalid('Private or local database hosts are not allowed.');
  }
  const ipVersion = isIP(normalized);
  if (ipVersion === 4 && privateIpv4(normalized)) {
    throw invalid('Private database hosts are not allowed.');
  }
  if (ipVersion === 6 && privateIpv6(normalized)) {
    throw invalid('Private database hosts are not allowed.');
  }
}

export function validateTenantDsn(raw: unknown): ValidatedTenantDsn {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) throw invalid('Database connection string is required.');
  if (value.length > 4096) throw invalid('Database connection string is too long.');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid('Database connection string is not a valid URL.');
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw invalid('Only postgres:// or postgresql:// connection strings are supported.');
  }
  assertHostAllowed(url.hostname);

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw invalid('Database port is invalid.');

  let database = '';
  let username = '';
  try {
    database = decodeURIComponent(url.pathname.replace(/^\/+/, '')).trim();
    username = decodeURIComponent(url.username).trim();
  } catch {
    throw invalid('Database connection string contains an invalid escape sequence.');
  }
  if (!database) throw invalid('Database name is required.');

  if (!username) throw invalid('Database username is required.');
  if (!url.password) throw invalid('Database password is required.');

  const sslmode = (url.searchParams.get('sslmode') || 'require').toLowerCase();
  if (!ALLOWED_SSL_MODES.has(sslmode)) throw invalid('Unsupported sslmode.');
  url.searchParams.set('sslmode', sslmode);

  return {
    dsn: url.toString(),
    host,
    port,
    database,
    username,
    sslmode,
    provider: host.includes('supabase') ? 'supabase' : 'postgres',
  };
}

export function tenantDsnFingerprint(input: ValidatedTenantDsn): string {
  return createHash('sha256')
    .update(`${input.host.toLowerCase()}:${input.port}/${input.database}:${input.username}`)
    .digest('hex');
}

export function tenantDsnKey(validated: ValidatedTenantDsn): string {
  return `${validated.host}:${validated.port}/${validated.database}`;
}

export function sslOptionsForMode(mode: string): false | { rejectUnauthorized: boolean } {
  if (mode === 'disable') return false;
  return { rejectUnauthorized: mode === 'verify-ca' || mode === 'verify-full' };
}
