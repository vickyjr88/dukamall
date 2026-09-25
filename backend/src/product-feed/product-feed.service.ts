import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { storefrontOriginForShop } from '../common/storefront-origin';

/**
 * One shared row-shaper for every ad platform's catalog feed (Meta, Google
 * Merchant Center, TikTok), per design doc S:2.7. drip-crm had two
 * independent implementations of this same logic (web/app/lib/product-feed.ts
 * and backend/src/storefront/storefront.controller.ts's catalog.csv) that
 * could silently drift apart -- this platform gets exactly one, from the
 * start, with per-shop `link`/`image_link`/`brand` resolved from the shop
 * itself rather than a hardcoded brand name.
 */

export type FeedRow = {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  availability: 'in stock' | 'out of stock';
  price: string;
  condition: 'new';
  brand: string;
  mpn: string;
  itemGroupId: string;
  productType: string;
};

@Injectable()
export class ProductFeedService {
  constructor(private prisma: PrismaService) {}

  async buildRows(shopId: string): Promise<FeedRow[]> {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    const products = await this.prisma.product.findMany({
      where: { shopId, isActive: true },
      include: { variants: { where: { isActive: true } }, category: true },
    });

    const origin = storefrontOriginForShop(shop);
    const rows: FeedRow[] = [];

    for (const product of products) {
      const imageUrls = Array.isArray(product.imageUrls) ? (product.imageUrls as string[]) : [];
      const image = imageUrls[0];
      if (!image) continue;

      const link = `${origin}/shop/${product.slug}`;
      const description = product.description || product.name;

      for (const variant of product.variants) {
        rows.push({
          id: variant.sku,
          title: variant.size ? `${product.name} - ${variant.size}` : product.name,
          description,
          link,
          imageLink: image,
          availability: variant.stockOnHand > 0 ? 'in stock' : 'out of stock',
          price: `${Number(variant.priceKes).toFixed(2)} ${shop.currency}`,
          condition: 'new',
          brand: product.brand || shop.name,
          mpn: variant.sku,
          itemGroupId: product.id,
          productType: product.category?.name ?? '',
        });
      }
    }

    return rows;
  }
}
