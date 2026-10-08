import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * Encryption for the few secrets the database has to hold in a usable form: a
 * shop's Paystack secret key, the platform's SMTP password, admins' two-factor
 * seeds. A leaked database dump or backup should not hand those over.
 *
 * AES-256-GCM with a key from SECRETS_ENCRYPTION_KEY (32 random bytes, as base64
 * or 64 hex characters). Stored as "enc:v1:<iv>:<tag>:<ciphertext>", all
 * base64url. Anything without that prefix is treated as legacy plaintext and
 * returned unchanged, so existing rows keep working until SecretsMigration
 * re-saves them encrypted.
 *
 * With no key configured nothing is encrypted (and a warning is logged once):
 * the app still runs, so a missing variable can't take payments or email down,
 * but the health page in the admin console reports it.
 */
const PREFIX = 'enc:v1:';
const logger = new Logger('Secrets');
let warned = false;

function loadKey(): Buffer | null {
  const raw = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('SECRETS_ENCRYPTION_KEY must be 32 bytes (base64, or 64 hex characters). Generate one with: openssl rand -base64 32');
  }
  return key;
}

export const secretsKeyConfigured = (): boolean => Boolean(process.env.SECRETS_ENCRYPTION_KEY?.trim());
export const isEncrypted = (value: string | null | undefined): boolean => Boolean(value?.startsWith(PREFIX));

export function encryptSecret(plain: string): string {
  const key = loadKey();
  if (!key) {
    if (!warned) { warned = true; logger.warn('SECRETS_ENCRYPTION_KEY is not set: secrets are being stored unencrypted.'); }
    return plain;
  }
  if (isEncrypted(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${PREFIX}${[iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join(':')}`;
}

/** Plaintext for a stored value, whether it is encrypted or still legacy plaintext. */
export function decryptSecret(stored: string): string;
export function decryptSecret(stored: string | null | undefined): string | null;
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return stored ?? null;
  if (!isEncrypted(stored)) return stored;
  const key = loadKey();
  if (!key) throw new Error('A stored secret is encrypted but SECRETS_ENCRYPTION_KEY is not set.');
  const [iv, tag, data] = stored.slice(PREFIX.length).split(':').map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
