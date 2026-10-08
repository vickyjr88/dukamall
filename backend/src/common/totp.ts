import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Time-based one-time passwords (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits)
 * -- what Google Authenticator, Authy, 1Password and every other authenticator
 * app speak. Written out here rather than pulled in as a dependency because it
 * is a few lines and the platform only needs this one flavour.
 */
const STEP_SECONDS = 30;
const DIGITS = 6;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let value = 0; const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** A new random shared secret (160 bits), base32 as authenticator apps expect. */
export const generateTotpSecret = () => base32Encode(randomBytes(20));

export const currentStep = (now: number = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * The step a code was valid for, or null. Accepts the previous, current and next
 * step to absorb clock drift, and refuses any step at or before lastStep so one
 * code can't be used twice (e.g. by someone who watched it being typed).
 */
export function verifyTotp(secret: string, code: string, lastStep: number | null = null, now: number = Date.now()): number | null {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const base = currentStep(now);
  for (const step of [base - 1, base, base + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (safeEqual(totpCode(secret, step), clean)) return step;
  }
  return null;
}

export const otpauthUrl = (secret: string, account: string, issuer = 'Shops Platform') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

/** Single-use backup codes, shown once. Stored only as hashes. */
export const newRecoveryCodes = (n = 8): string[] => Array.from({ length: n }, () => {
  const hex = randomBytes(6).toString('hex');
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8)}`;
});
export const normaliseRecoveryCode = (code: string) => code.toLowerCase().replace(/[^a-f0-9]/g, '');
export const hashRecoveryCode = (code: string) => createHash('sha256').update(normaliseRecoveryCode(code)).digest('hex');
