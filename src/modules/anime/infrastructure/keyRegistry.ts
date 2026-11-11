import { decryptConfig, encryptConfig } from './infrastructure.crypto';

const MIN_KEY_LENGTH = 32;
const DEFAULT_KEY_VERSION = 2;

export type KeySource = 'env' | 'kms';

export interface KeyCustodyStatus {
  mode: KeySource;
  current_version: number;
  versions: number[];
  root_outside_database: true;
  kms_key_id: string | null;
  kms_ready: boolean;
}

function validKey(value: unknown): value is string {
  return typeof value === 'string' && value.length >= MIN_KEY_LENGTH;
}

function parseVersionedKeys(): Map<number, string> {
  const out = new Map<number, string>();
  const raw = process.env.ANIME_ENCRYPTION_KEYS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          const version = Number(entry?.version);
          if (Number.isInteger(version) && version > 0 && validKey(entry?.key)) out.set(version, entry.key);
        }
      } else if (parsed && typeof parsed === 'object') {
        for (const [version, key] of Object.entries(parsed)) {
          const parsedVersion = Number(version);
          if (Number.isInteger(parsedVersion) && parsedVersion > 0 && validKey(key)) out.set(parsedVersion, key);
        }
      }
    } catch {
      throw new Error('ANIME_ENCRYPTION_KEYS must be valid JSON.');
    }
  }
  return out;
}

function legacyKey(): string | null {
  const key = process.env.ANIME_ENCRYPTION_KEY;
  return validKey(key) ? key : null;
}

function configuredVersion(): number {
  const parsed = Number(process.env.ANIME_ENCRYPTION_KEY_VERSION);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_KEY_VERSION;
}

export function currentKeyVersion(): number {
  const versioned = parseVersionedKeys();
  const configured = configuredVersion();
  if (versioned.has(configured)) return configured;
  const highest = Math.max(0, ...versioned.keys());
  return highest || configured;
}

export function currentMasterKey(): string {
  const version = currentKeyVersion();
  const versioned = parseVersionedKeys();
  const key = versioned.get(version) ?? legacyKey();
  if (!key) throw new Error('ANIME_ENCRYPTION_KEY(S) missing or shorter than 32 characters.');
  return key;
}

export function keyForVersion(version: number): string | null {
  return parseVersionedKeys().get(version) ?? null;
}

export function allDecryptionKeys(preferredVersion?: number): string[] {
  const versioned = parseVersionedKeys();
  const keys: string[] = [];
  const preferred = preferredVersion ? versioned.get(preferredVersion) : null;
  if (preferred) keys.push(preferred);
  for (const version of [...versioned.keys()].sort((a, b) => b - a)) {
    const key = versioned.get(version);
    if (key && !keys.includes(key)) keys.push(key);
  }
  const legacy = legacyKey();
  if (legacy && !keys.includes(legacy)) keys.push(legacy);
  for (const key of String(process.env.ANIME_ENCRYPTION_KEY_PREVIOUS || '').split(',')) {
    const trimmed = key.trim();
    if (validKey(trimmed) && !keys.includes(trimmed)) keys.push(trimmed);
  }
  return keys;
}

export function encryptWithCurrentKey(plaintext: string): { ciphertext: string; key_version: number } {
  return { ciphertext: encryptConfig(plaintext, currentMasterKey()), key_version: currentKeyVersion() };
}

export function decryptWithKeyVersion(ciphertext: string, keyVersion?: number): string {
  const keys = allDecryptionKeys(keyVersion);
  if (keys.length === 0) throw new Error('No infrastructure encryption keys are configured.');
  const primary = keys[0];
  return decryptConfig(ciphertext, primary, keys.slice(1));
}

export function keyCustodyStatus(): KeyCustodyStatus {
  const versioned = parseVersionedKeys();
  const kmsKeyId = String(process.env.ANIME_KMS_KEY_ID || '').trim() || null;
  return {
    mode: kmsKeyId ? 'kms' : 'env',
    current_version: currentKeyVersion(),
    versions: [...new Set([...versioned.keys(), currentKeyVersion()])].sort((a, b) => a - b),
    root_outside_database: true,
    kms_key_id: kmsKeyId,
    kms_ready: Boolean(kmsKeyId),
  };
}
