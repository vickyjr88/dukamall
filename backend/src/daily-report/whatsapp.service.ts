import { Injectable } from '@nestjs/common';
import { IntegrationsService } from '../integrations/integrations.service';
import { WhatsAppClient, WhatsAppSendResult } from '../integrations/whatsapp-client';

export type { WhatsAppSendResult };

/**
 * The WhatsApp sender for notices to a shop's OWNER (the daily report). A report is sent from the shop's own connected number when it
 * has one switched on; otherwise from the operator's sender in the admin settings; otherwise it is not sent and the screen says why.
 * Nothing is read from environment variables: the ids and the token come from the credential store (integrations/).
 *
 * It is never used for a message a customer sees. Those are sent only from the shop's own connection.
 */
@Injectable()
export class WhatsAppService {
  constructor(private readonly integrations: IntegrationsService) {}

  /** A client for this shop's owner notices, or null when no sender is connected. */
  async forOwnerNotices(shopId: string): Promise<WhatsAppClient | null> {
    const c = await this.integrations.resolve(shopId, 'WHATSAPP', { allowPlatform: true });
    if (!c) return null;
    return new WhatsAppClient({
      phoneNumberId: c.config.phoneNumberId,
      accessToken: c.secrets.accessToken,
      template: c.config.reportTemplate || 'daily_report',
      language: c.config.templateLang || 'en',
    });
  }

  /** For the Daily Report screen: is there a sender, whose is it, and which template does it use. */
  async statusFor(shopId: string): Promise<{ configured: boolean; source: 'shop' | 'platform' | null; template: string }> {
    const c = await this.integrations.resolve(shopId, 'WHATSAPP', { allowPlatform: true });
    return { configured: Boolean(c), source: c?.source ?? null, template: c?.config.reportTemplate || 'daily_report' };
  }
}
