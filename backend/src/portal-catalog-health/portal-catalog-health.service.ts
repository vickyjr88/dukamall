import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { analyseCatalog } from './catalog-health';

@Injectable()
export class PortalCatalogHealthService {
  constructor(private prisma: PrismaService) {}

  /** The shop's live (active) products checked for the usual data problems. Hidden products are skipped on purpose. */
  async check(shopId: string) {
    const [shop, categoryCount, products] = await Promise.all([
      this.prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { name: true, slug: true } }),
      this.prisma.productCategory.count({ where: { shopId } }),
      this.prisma.product.findMany({
        where: { shopId, isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, slug: true, brand: true, description: true, imageUrls: true, categoryId: true,
          variants: { where: { isActive: true }, select: { sku: true, size: true, priceKes: true, stockOnHand: true } },
        },
      }),
    ]);
    return analyseCatalog(
      products.map((p) => ({
        ...p,
        // Stored as JSON: anything that isn't a list of strings counts as no photos.
        imageUrls: Array.isArray(p.imageUrls) ? p.imageUrls.filter((u): u is string => typeof u === 'string' && u.trim() !== '') : [],
        variants: p.variants.map((v) => ({ ...v, priceKes: Number(v.priceKes) })),
      })),
      { shopName: shop.name, shopSlug: shop.slug, categoryCount },
    );
  }
}
