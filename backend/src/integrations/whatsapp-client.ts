import { Logger } from '@nestjs/common';

export type WhatsAppSendResult = { delivered: boolean; messageId?: string; error?: string };

export type WhatsAppConnection = {
  phoneNumberId: string;
  accessToken: string;
  template: string;
  language: string;
  apiVersion?: string;
};

const logger = new Logger('WhatsAppClient');

/**
 * WhatsApp Business Cloud API for one connection. A message to someone who has not written to the business in the last 24 hours must
 * be an approved template, so this only sends templates here; the report's own text is the template's parameters.
 *
 * It never throws: a failure comes back as "not delivered" with the reason, so a run of sends is not aborted. It holds the token
 * only for the life of one object and never puts it in a message or a log line.
 */
export class WhatsAppClient {
  constructor(private readonly connection: WhatsAppConnection) {}

  get templateName() {
    return this.connection.template;
  }

  /** The Cloud API wants digits only, with the country code: 254722000000. */
  static normalisePhone(raw: string): string | null {
    const digits = (raw || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('254') && digits.length === 12) return digits;
    if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
    if (digits.length === 9) return `254${digits}`;
    // Another country's number, already with its code.
    return digits.length >= 11 && digits.length <= 15 ? digits : null;
  }

  /**
   * A plain text message. WhatsApp only allows it within 24 hours of the person's own last message, so it is for replies: the
   * "you will get updates" notice, and the STOP and START confirmations.
   */
  async sendText(to: string, body: string): Promise<WhatsAppSendResult> {
    const phone = WhatsAppClient.normalisePhone(to);
    if (!phone) return { delivered: false, error: `Unusable WhatsApp number "${to}"` };
    const { phoneNumberId, accessToken, apiVersion = 'v21.0' } = this.connection;
    try {
      const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body, preview_url: false } }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await response.json().catch(() => ({}))) as any;
      if (!response.ok) {
        const message = data?.error?.message ?? `HTTP ${response.status}`;
        logger.warn(`WhatsApp text to ${phone} failed: ${message}`);
        return { delivered: false, error: message };
      }
      return { delivered: true, messageId: data?.messages?.[0]?.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`WhatsApp text to ${phone} threw: ${message}`);
      return { delivered: false, error: message };
    }
  }

  /** `template` defaults to the connection's own (the daily report's); outreach passes the template for the message it is sending. */
  async sendTemplate(to: string, parameters: string[], templateName?: string): Promise<WhatsAppSendResult> {
    const phone = WhatsAppClient.normalisePhone(to);
    if (!phone) return { delivered: false, error: `Unusable WhatsApp number "${to}"` };
    const { phoneNumberId, accessToken, language, apiVersion = 'v21.0' } = this.connection;
    const template = templateName ?? this.connection.template;

    try {
      const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: template,
            language: { code: language },
            // A template with no variables takes no components at all.
            ...(parameters.length ? { components: [{ type: 'body', parameters: parameters.map((text) => ({ type: 'text', text })) }] } : {}),
          },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await response.json().catch(() => ({}))) as any;
      if (!response.ok) {
        const message = body?.error?.message ?? `HTTP ${response.status}`;
        logger.warn(`WhatsApp to ${phone} failed: ${message}`);
        return { delivered: false, error: message };
      }
      return { delivered: true, messageId: body?.messages?.[0]?.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`WhatsApp to ${phone} threw: ${message}`);
      return { delivered: false, error: message };
    }
  }
}
