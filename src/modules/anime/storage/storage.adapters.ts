import { createHash, createHmac } from 'node:crypto';
import { AnimeError, AnimeErrorCode } from '../errors/anime.errors';
import type { StorageProviderId, StoragePutInput, StoragePutResult } from './storage.types';

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `Storage config field ${field} is required.` });
  }
  return value.trim();
}

function safeHttps(value: string, field: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `${field} must be a valid URL.` }); }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: `${field} must use HTTPS outside local development.` });
  }
  return value;
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function encodePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export function signS3Put(input: {
  endpoint: string; bucket: string; key: string; region: string;
  access_key_id: string; secret_access_key: string; payload: Buffer;
  content_type: string; now?: Date;
}): { url: string; headers: Record<string, string> } {
  const endpoint = safeHttps(input.endpoint, 'endpoint').replace(/\/$/, '');
  const base = new URL(endpoint);
  const canonicalUri = `/${encodePath(input.bucket)}/${encodePath(input.key)}`;
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(input.payload);
  const headers: Record<string, string> = {
    'content-type': input.content_type,
    host: base.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((name) => `${name}:${headers[name]}\n`).join('');
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(Buffer.from(canonicalRequest))].join('\n');
  const kDate = hmac(`AWS4${input.secret_access_key}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${input.access_key_id}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url: `${endpoint}${canonicalUri}`, headers };
}

async function putTelegram(config: Record<string, unknown>, input: StoragePutInput): Promise<StoragePutResult> {
  const token = asString(config.bot_token, 'bot_token');
  const chatId = asString(config.storage_chat_id ?? config.chat_id, 'storage_chat_id');
  const apiBase = safeHttps(String(config.api_base || 'https://api.telegram.org'), 'api_base').replace(/\/$/, '');
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('document', new Blob([input.data], { type: input.content_type }), input.filename);
  const response = await fetch(`${apiBase}/bot${token}/sendDocument`, { method: 'POST', body: form });
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok || body?.ok === false) {
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: 'Telegram storage upload failed.', cause: body });
  }
  return {
    provider: 'telegram', key: input.key, bytes: input.data.length, sha256: sha256Hex(input.data),
    remote_id: body?.result?.message_id ? String(body.result.message_id) : null,
    url: body?.result?.document?.file_id ? `telegram:${body.result.document.file_id}` : null,
  };
}

async function putCustomHttp(config: Record<string, unknown>, input: StoragePutInput): Promise<StoragePutResult> {
  const uploadUrl = safeHttps(asString(config.upload_url, 'upload_url'), 'upload_url');
  const headers: Record<string, string> = { 'content-type': input.content_type, 'x-storage-key': input.key };
  if (typeof config.bearer_token === 'string' && config.bearer_token.trim()) headers.authorization = `Bearer ${config.bearer_token.trim()}`;
  const response = await fetch(uploadUrl, { method: 'PUT', headers, body: input.data });
  if (!response.ok) {
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: `Custom storage upload failed with HTTP ${response.status}.` });
  }
  const body = await response.json().catch(() => ({})) as any;
  return {
    provider: 'custom_http', key: input.key, bytes: input.data.length, sha256: sha256Hex(input.data),
    remote_id: body?.id ? String(body.id) : null,
    url: typeof body?.url === 'string' ? body.url : (typeof config.download_url === 'string' ? config.download_url : null),
  };
}

async function putS3(config: Record<string, unknown>, input: StoragePutInput): Promise<StoragePutResult> {
  const endpoint = asString(config.endpoint, 'endpoint');
  const bucket = asString(config.bucket, 'bucket');
  const region = asString(config.region || 'us-east-1', 'region');
  const accessKey = asString(config.access_key_id, 'access_key_id');
  const secretKey = asString(config.secret_access_key, 'secret_access_key');
  const prefix = typeof config.prefix === 'string' ? config.prefix.replace(/^\/+|\/+$/g, '') : '';
  const key = prefix ? `${prefix}/${input.key}` : input.key;
  const signed = signS3Put({ endpoint, bucket, key, region, access_key_id: accessKey, secret_access_key: secretKey, payload: input.data, content_type: input.content_type });
  const response = await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: input.data });
  if (!response.ok) {
    throw new AnimeError({ code: AnimeErrorCode.PROVIDER_UNAVAILABLE, message: `S3-compatible storage upload failed with HTTP ${response.status}.` });
  }
  return {
    provider: 's3_compatible', key, bytes: input.data.length, sha256: sha256Hex(input.data),
    remote_id: response.headers.get('etag'), url: signed.url,
  };
}

export async function putObject(provider: StorageProviderId, config: Record<string, unknown>, input: StoragePutInput): Promise<StoragePutResult> {
  if (provider === 'telegram') return putTelegram(config, input);
  if (provider === 'custom_http') return putCustomHttp(config, input);
  if (provider === 's3_compatible') return putS3(config, input);
  throw new AnimeError({ code: AnimeErrorCode.OUTPUT_INVALID, message: 'Unsupported storage provider.' });
}
