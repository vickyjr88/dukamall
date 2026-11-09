import { Injectable } from '@nestjs/common';
import { storefrontOriginForShop } from '../common/storefront-origin';
import { IntegrationsService } from '../integrations/integrations.service';
import { WhatsAppClient } from '../integrations/whatsapp-client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PRIVATE_TEXT, DEFAULT_PUBLIC_TEXT } from './facebook-comments';

export type ShopFacebook = {
  pageId: string;
  token: string;
  /** The shop's own Meta app secret, when it saved one (checks Meta's signature on incoming events). */
  config: Record<string, string>;
  settings: { commentReplies: boolean; publicReply: boolean; dailyCap: number; privateText: string; publicText: string };
  /** What the reply wording is filled with: the shop's own name, links and address. */
  facts: { shop: string; whatsapp: string; page: string; site: string; location: string };
};

/**
 * A shop's own Facebook Page connection, ready to use: its Page id and token, how it set up comment replies, and the facts the wording is
 * filled with. Comes only from the shop's own connection, switched on and complete. Features start off.
 */
@Injectable()
export class FacebookConnectionService {
  constructor(private readonly integrations: IntegrationsService, private readonly prisma: PrismaService) {}

  async forShop(shopId: string): Promise<ShopFacebook | null> {
    const c = await this.integrations.resolve(shopId, 'FACEBOOK');
    if (!c) return null;
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return null;
    const phone = WhatsAppClient.normalisePhone(shop.whatsappNumber ?? '');
    const cap = Number(c.config.replyDailyCap);
    return {
      pageId: c.config.pageId,
      token: c.secrets.pageAccessToken,
      config: c.config,
      settings: {
        commentReplies: c.config.commentReplies === 'true',
        publicReply: (c.config.publicReply ?? 'true') !== 'false',
        dailyCap: Number.isFinite(cap) && cap > 0 ? Math.min(cap, 1000) : 200,
        privateText: c.config.privateReplyText || DEFAULT_PRIVATE_TEXT,
        publicText: c.config.publicReplyText || DEFAULT_PUBLIC_TEXT,
      },
      facts: {
        shop: shop.name,
        whatsapp: phone ? `https://wa.me/${phone}` : '',
        page: c.config.pageUrl || shop.facebookUrl || `https://www.facebook.com/${c.config.pageId}`,
        site: storefrontOriginForShop(shop),
        location: (shop.address ?? '').trim(),
      },
    };
  }
}
