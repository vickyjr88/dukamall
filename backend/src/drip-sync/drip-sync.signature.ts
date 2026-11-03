import { createHmac, timingSafeEqual } from 'crypto';

/** How far a request's timestamp may be from ours before it is refused, so a captured request cannot be replayed later. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** `t=<unix seconds>,v1=<hex hmac-sha256 of "<t>.<raw body>">`. Drip's catalogue-sync service builds this. */
export function sign(secret: string, rawBody: string, timestamp: number): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

export function verifySignature(secret: string, rawBody: string, header: string | undefined, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.trim().split('=') as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(sign(secret, rawBody, timestamp));
  const given = Buffer.from(`t=${timestamp},v1=${parts.v1 ?? ''}`);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
