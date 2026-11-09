import { Injectable } from '@nestjs/common';
import { IntegrationsService } from '../integrations/integrations.service';
import { WhatsAppClient } from '../integrations/whatsapp-client';
import { PrismaService } from '../prisma/prisma.service';
import { whatsappSettings } from './whatsapp-kinds';

export type ShopWhatsapp = {
  client: WhatsAppClient;
  config: Record<string, string>;
  settings: ReturnType<typeof whatsappSettings>;
  shopName: string;
  phoneNumberId: string | null;
};

/**
 * A shop's own WhatsApp connection, ready to use. Everything here is customer-facing, so it comes ONLY from the shop's own connection,
 * switched on and complete: the operator's sender (which stands in for the owner's daily report) is never used for a customer.
 */
@Injectable()
export class WhatsappConnectionService {
  constructor(private readonly integrations: IntegrationsService, private readonly prisma: PrismaService) {}

  async forShop(shopId: string): Promise<ShopWhatsapp | null> {
    const c = await this.integrations.resolve(shopId, 'WHATSAPP');
    if (!c) return null;
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, select: { name: true } });
    return {
      client: new WhatsAppClient({
        phoneNumberId: c.config.phoneNumberId,
        accessToken: c.secrets.accessToken,
        template: c.config.reportTemplate || 'daily_report',
        language: c.config.templateLang || 'en',
      }),
      config: c.config,
      settings: whatsappSettings(c.config),
      shopName: shop?.name ?? 'the shop',
      phoneNumberId: c.externalId,
    };
  }
}
