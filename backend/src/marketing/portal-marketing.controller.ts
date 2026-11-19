import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ShopId } from '../common/shop-context';
import { storefrontOriginForShop } from '../common/storefront-origin';
import { PrismaService } from '../prisma/prisma.service';
import { PortalShareService } from '../portal-share/portal-share.service';
import { MarketingSummaryService } from './marketing-summary.service';

/**
 * One read for the portal's Marketing hub: what is switched on and connected, what went out over the last 7 days, what needs a person, how much
 * has been shared by hand, and the product feed addresses for ad platforms. Read-only; it never selects a secret (the summary service is the same
 * one behind the owner's morning email and the operator's page, so all three always agree).
 */
@ApiTags('portal-marketing')
@ApiBearerAuth()
@Controller('portal/marketing')
export class PortalMarketingController {
  constructor(private summary: MarketingSummaryService, private prisma: PrismaService, private share: PortalShareService) {}

  @Get('hub')
  async hub(@ShopId() shopId: string) {
    const now = new Date();
    const [shop, facts, shares, products] = await Promise.all([
      this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } }),
      this.summary.forShop(shopId, { start: new Date(now.getTime() - 7 * 86_400_000), end: now }, now),
      this.share.stats(shopId, 7),
      this.prisma.$queryRaw<{ shareable: number; no_photo: number }[]>`
        SELECT count(*) FILTER (WHERE s.stock > 0)::int AS shareable,
               count(*) FILTER (WHERE s.photos = 0)::int AS no_photo
        FROM (
          SELECT p.id,
                 CASE WHEN jsonb_typeof(p."imageUrls") = 'array' THEN jsonb_array_length(p."imageUrls") ELSE 0 END AS photos,
                 coalesce(sum(greatest(v."stockOnHand", 0)) FILTER (WHERE v."isActive"), 0) AS stock
          FROM "Product" p LEFT JOIN "ProductVariant" v ON v."productId" = p.id
          WHERE p."shopId" = ${shopId} AND p."isActive" = true GROUP BY p.id
        ) s`,
    ]);
    const origin = storefrontOriginForShop(shop);
    return {
      shop: { name: shop.name, origin, whatsappNumber: shop.whatsappNumber ?? null, groupUrl: shop.whatsappGroupUrl ?? null },
      connections: { whatsapp: facts.whatsapp.present && facts.whatsapp.enabled, facebook: facts.facebook.present && facts.facebook.enabled, threads: facts.threads.present && facts.threads.enabled },
      features: facts.features,
      postingAllowed: facts.postingAllowed,
      week: { whatsapp: facts.whatsappActivity, comments: facts.comments, posts: facts.posts, status: facts.status },
      attention: facts.attention,
      shares,
      catalogue: { shareable: products[0]?.shareable ?? 0, noPhoto: products[0]?.no_photo ?? 0 },
      pixels: { meta: Boolean(shop.metaPixelId), tiktok: Boolean(shop.tiktokPixelId), x: Boolean(shop.xPixelId) },
      feeds: [
        { name: 'Facebook and Instagram catalogue (XML)', url: `${origin}/product-feed.xml` },
        { name: 'Facebook and Instagram catalogue (CSV)', url: `${origin}/product-feed.csv` },
        { name: 'TikTok catalogue (XML)', url: `${origin}/product-feed-tiktok.xml` },
        { name: 'TikTok catalogue (CSV)', url: `${origin}/product-feed-tiktok.csv` },
      ],
    };
  }
}
