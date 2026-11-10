const SENSITIVE_PAYLOAD_KEYS = new Set([
  'userinfrastructure',
  'gpurouting',
  'telegramstorage',
  'apikey',
  'accesskey',
  'secretkey',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apitoken',
  'authtoken',
  'bearertoken',
  'sessiontoken',
  'clientsecret',
  'bottoken',
  'password',
  'passwd',
  'authorization',
  'privatekey',
  'connectionstring',
  'configencrypted',
  'credential',
  'credentials',
]);

export function isSensitivePayloadKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_PAYLOAD_KEYS.has(normalized);
}

export function redactSensitivePayload<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => redactSensitivePayload(item)) as T;
  if (value === null || typeof value !== 'object') return value;
  const redacted: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitivePayloadKey(key)) continue;
    redacted[key] = redactSensitivePayload(child);
  }
  return redacted as T;
}
