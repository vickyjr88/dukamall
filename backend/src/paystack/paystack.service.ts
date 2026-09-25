import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Paystack, kept behind one service -- same shape as drip-crm's, with one
 * change: the secret key is per-shop, read from Shop.paystackSecretKey
 * (design doc S:2.8, "flat subscription" model -- each shop brings/connects
 * its own Paystack account, money lands with them directly, no platform
 * split-payment routing in v1).
 */
@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly base = 'https://api.paystack.co';

  configured(secretKey: string | null | undefined): boolean {
    return Boolean(secretKey);
  }

  /** KES 3,499.00 -> 349900. Rounded, never truncated. */
  static toSubunit(amount: number) {
    return Math.round(amount * 100);
  }

  private async call<T>(secretKey: string, path: string, init: RequestInit = {}): Promise<T> {
    if (!secretKey) {
      throw new BadRequestException('Online payment is not configured for this shop. Pay via WhatsApp instead.');
    }

    const response = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    const body = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || body?.status === false) {
      this.logger.warn(`Paystack ${path} failed: ${body?.message || response.status}`);
      throw new BadRequestException(body?.message || 'Payment provider rejected the request.');
    }
    return body.data as T;
  }

  initialise(secretKey: string, currency: string, params: {
    email: string;
    amount: number;
    reference: string;
    callbackUrl: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.call<{ authorization_url: string; access_code: string; reference: string }>(
      secretKey,
      '/transaction/initialize',
      {
        method: 'POST',
        body: JSON.stringify({
          email: params.email,
          amount: PaystackService.toSubunit(params.amount),
          currency,
          reference: params.reference,
          callback_url: params.callbackUrl,
          metadata: params.metadata,
        }),
      },
    );
  }

  verify(secretKey: string, reference: string) {
    return this.call<{ status: string; amount: number; currency: string; reference: string }>(
      secretKey,
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
  }

  verifySignature(secretKey: string, rawBody: Buffer | string, signature?: string) {
    if (!secretKey || !signature) return false;

    const expected = createHmac('sha512', secretKey)
      .update(typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody)
      .digest('hex');

    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
