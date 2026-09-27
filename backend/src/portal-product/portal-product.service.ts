import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './portal-product.dto';

@Injectable()
export class PortalProductService {
  constructor(private prisma: PrismaService) {}

  list(shopId: string) {
    return this.prisma.product.findMany({
      where: { shopId },
      include: { variants: true, category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(shopId: string, dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        shopId,
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        brand: dto.brand,
        categoryId: dto.categoryId,
        imageUrls: dto.imageUrls ?? [],
        isFeatured: dto.isFeatured ?? false,
        variants: {
          create: dto.variants.map((v) => ({
            sku: v.sku,
            name: v.name,
            size: v.size,
            priceKes: v.priceKes,
            wasPriceKes: v.wasPriceKes,
            stockOnHand: v.stockOnHand,
          })),
        },
      },
      include: { variants: true },
    });
  }

  async setActive(shopId: string, productId: string, isActive: boolean) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, shopId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.product.update({ where: { id: productId }, data: { isActive } });
  }

  async update(shopId: string, productId: string, data: {
    name?: string; description?: string; brand?: string; imageUrls?: string[]; isFeatured?: boolean;
  }) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, shopId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.product.update({ where: { id: productId }, data, include: { variants: true } });
  }

  async updateVariant(shopId: string, variantId: string, data: { priceKes?: number; wasPriceKes?: number | null; isActive?: boolean }) {
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, product: { shopId } } });
    if (!variant) throw new NotFoundException('Variant not found');
    return this.prisma.productVariant.update({ where: { id: variantId }, data });
  }

  async adjustStock(shopId: string, variantId: string, delta: number) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, product: { shopId } },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: { stockOnHand: { increment: delta } },
    });
  }

  /** Sets stock to an exact count, distinct from adjustStock's relative delta -- for correcting a count directly (e.g. after a physical stocktake) rather than adding/removing units. */
  async setStock(shopId: string, variantId: string, stockOnHand: number) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, product: { shopId } },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return this.prisma.productVariant.update({ where: { id: variantId }, data: { stockOnHand } });
  }
}
