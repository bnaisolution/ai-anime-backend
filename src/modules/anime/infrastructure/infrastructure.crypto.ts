import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 16;
const V2_PREFIX = 'v2:';
const V2_CONTEXT = Buffer.from('anime-infrastructure-config-v2');

function deriveLegacyKey(masterKey: string, salt: Buffer): Buffer {
  return scryptSync(masterKey, salt, 32);
}

function deriveV2Key(masterKey: string, salt: Buffer): Buffer {
  return scryptSync(masterKey, Buffer.concat([V2_CONTEXT, salt]), 32);
}

export function encryptConfig(plaintext: string, masterKey: string): string {
  const salt = randomBytes(SALT_LEN);
  const key = deriveV2Key(masterKey, salt);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${V2_PREFIX}${Buffer.concat([salt, iv, tag, enc]).toString('base64')}`;
}

function decryptPayload(payload: Buffer, key: Buffer): string {
  const salt = payload.subarray(0, SALT_LEN);
  const iv = payload.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = payload.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const enc = payload.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function encryptConfigLegacy(plaintext: string, masterKey: string): string {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveLegacyKey(masterKey, salt);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, enc]).toString('base64');
}

export function decryptConfig(ciphertext: string, masterKey: string, previousMasterKeys: string[] = []): string {
  const keys = [masterKey, ...previousMasterKeys].filter((key) => typeof key === 'string' && key.length > 0);
  const isV2 = ciphertext.startsWith(V2_PREFIX);
  const raw = isV2 ? ciphertext.slice(V2_PREFIX.length) : ciphertext;
  const payload = Buffer.from(raw, 'base64');
  const salt = payload.subarray(0, SALT_LEN);
  let lastError: unknown = null;
  for (const key of keys) {
    try {
      return decryptPayload(payload, isV2 ? deriveV2Key(key, salt) : deriveLegacyKey(key, salt));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to decrypt infrastructure config.');
}

export function getCipherVersion(ciphertext: string): number {
  return ciphertext.startsWith(V2_PREFIX) ? 2 : 1;
}

export function maskConfig(cfg: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const sensitive = /(token|key|secret|password|api_key|refresh)/i;
  for (const [k, v] of Object.entries(cfg)) {
    if (sensitive.test(k) && typeof v === 'string' && v.length > 8) {
      out[k] = v.slice(0, 4) + '****' + v.slice(-4);
    } else if (sensitive.test(k) && typeof v === 'string') {
      out[k] = '****';
    } else {
      out[k] = v;
    }
  }
  return out;
}
