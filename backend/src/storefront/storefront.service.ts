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
    return product;
  }

  listCategories(shopId: string) {
    return this.prisma.productCategory.findMany({ where: { shopId, isActive: true } });
  }
}
