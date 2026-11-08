import { isIP } from 'node:net';

const TELEGRAM_API_HOST = 'api.telegram.org';
const TELEGRAM_FILE_ID = /^[A-Za-z0-9_=-]{8,512}$/;
const TELEGRAM_BOT_TOKEN = /^[0-9]{5,}:[A-Za-z0-9_-]{10,}$/;

export class TelegramProxyError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'TelegramProxyError';
  }
}

export function invalidRequest(message: string): TelegramProxyError {
  return new TelegramProxyError(400, 'MEDIA_REQUEST_INVALID', message);
}

export function validateTelegramFileId(value: unknown): string {
  if (typeof value !== 'string') throw invalidRequest('Invalid Telegram file id');
  const fileId = value.trim();
  if (!TELEGRAM_FILE_ID.test(fileId)) throw invalidRequest('Invalid Telegram file id');
  return fileId;
}

export function validateTelegramBotToken(value: string | undefined): string {
  const token = (value || '').trim();
  if (!TELEGRAM_BOT_TOKEN.test(token)) {
    throw new TelegramProxyError(503, 'TELEGRAM_MEDIA_NOT_CONFIGURED', 'Telegram media storage is not configured');
  }
  return token;
}

export function isPrivateOrInternalHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;

  const family = isIP(host);
  if (family === 4) {
    const octets = host.split('.').map((part) => Number(part));
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }

  if (family === 6) {
    const v6 = host.toLowerCase();
    if (v6 === '::' || v6 === '::1') return true;
    if (v6.startsWith('fc') || v6.startsWith('fd')) return true;
    if (v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) return true;
    if (v6.startsWith('ff')) return true;
    if (v6.startsWith('::ffff:')) return isPrivateOrInternalHost(v6.slice('::ffff:'.length));
    return false;
  }

  return false;
}

export function assertSafeTelegramUrl(url: URL): URL {
  if (url.protocol !== 'https:') {
    throw new TelegramProxyError(502, 'TELEGRAM_DESTINATION_INVALID', 'Telegram destination rejected');
  }
  if (url.hostname !== TELEGRAM_API_HOST) {
    throw new TelegramProxyError(502, 'TELEGRAM_DESTINATION_INVALID', 'Telegram destination rejected');
  }
  if (url.port || url.username || url.password) {
    throw new TelegramProxyError(502, 'TELEGRAM_DESTINATION_INVALID', 'Telegram destination rejected');
  }
  if (isPrivateOrInternalHost(url.hostname)) {
    throw new TelegramProxyError(502, 'TELEGRAM_DESTINATION_INVALID', 'Telegram destination rejected');
  }
  return url;
}

export function buildTelegramApiUrl(path: string, query?: Record<string, string>): URL {
  const url = new URL(`https://${TELEGRAM_API_HOST}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  }
  return assertSafeTelegramUrl(url);
}

export function buildTelegramGetFileUrl(botToken: string, fileId: string): URL {
  return buildTelegramApiUrl(`/bot${encodeURIComponent(botToken)}/getFile`, { file_id: fileId });
}

export function buildTelegramDownloadUrl(botToken: string, filePath: string): URL {
  const raw = filePath.trim();
  if (!raw || raw.includes('\\') || /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new TelegramProxyError(502, 'TELEGRAM_DESTINATION_INVALID', 'Telegram destination rejected');
  }

  const segments = raw.split('/');
  if (!segments.length || segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('%'))) {
    throw new TelegramProxyError(502, 'TELEGRAM_DESTINATION_INVALID', 'Telegram destination rejected');
  }

  const safePath = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return assertSafeTelegramUrl(new URL(`https://${TELEGRAM_API_HOST}/file/bot${encodeURIComponent(botToken)}/${safePath}`));
}

export function safeMediaContentType(filePath: string, upstream: string | null): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const byExtension: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif'
  };
  if (byExtension[ext]) return byExtension[ext];

  const normalized = (upstream || '').split(';')[0].trim().toLowerCase();
  const allowed = new Set(Object.values(byExtension).concat('application/octet-stream'));
  return allowed.has(normalized) ? normalized : 'application/octet-stream';
}
