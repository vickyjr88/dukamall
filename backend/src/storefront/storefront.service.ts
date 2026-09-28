import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StorefrontService {
  constructor(private prisma: PrismaService) {}

  listProducts(shopId: string, categorySlug?: string) {
    return this.prisma.product.findMany({
      where: {
        shopId,
        isActive: true,
        ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      },
      include: { variants: { where: { isActive: true } }, category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listFeatured(shopId: string) {
    return this.prisma.product.findMany({
      where: { shopId, isActive: true, isFeatured: true },
      include: { variants: { where: { isActive: true } } },
    });
  }

  async getBySlug(shopId: string, slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { shopId_slug: { shopId, slug } },
      include: { variants: { where: { isActive: true } }, category: true },
    });
    if (!product || !product.isActive) throw new NotFoundException('Product not found');

    // "You might also like" -- same category first (what a shopper actually
    // means by "similar"), falling back to same brand, then to whatever's
    // newest, so a product with no category or a lone-brand item still gets
    // a populated rail instead of an empty one.
    const related = await this.findRelated(shopId, product.id, product.categoryId, product.brand);

    return { ...product, related };
  }

  private async findRelated(
    shopId: string,
    excludeProductId: string,
    categoryId: string | null,
    brand: string | null,
  ) {
    const take = 8;
    const baseWhere = { shopId, isActive: true, id: { not: excludeProductId } };
    const include = { variants: { where: { isActive: true } }, category: true } as const;

    if (categoryId) {
      const byCategory = await this.prisma.product.findMany({
        where: { ...baseWhere, categoryId },
        include,
        orderBy: { createdAt: 'desc' },
        take,
      });
      if (byCategory.length > 0) return byCategory;
    }

    if (brand) {
      const byBrand = await this.prisma.product.findMany({
        where: { ...baseWhere, brand },
        include,
        orderBy: { createdAt: 'desc' },
        take,
      });
      if (byBrand.length > 0) return byBrand;
    }

    return this.prisma.product.findMany({
      where: baseWhere,
      include,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  listCategories(shopId: string) {
    return this.prisma.productCategory.findMany({ where: { shopId, isActive: true } });
  }
}
