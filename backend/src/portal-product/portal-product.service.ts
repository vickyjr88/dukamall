import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './portal-product.dto';

export type PortalProductListQuery = {
  search?: string;
  category?: string;
  status?: 'active' | 'inactive';
  page?: number;
  pageSize?: number;
};

@Injectable()
export class PortalProductService {
  constructor(private prisma: PrismaService) {}

  /**
   * The portal's own product table -- search/filter/pagination, distinct
   * from the storefront's listProducts (StorefrontService): this one sees
   * inactive products too (a merchant managing their catalogue needs to
   * find something they turned off), matches on SKU as well as name (a
   * merchant thinks in SKUs a shopper never sees), and paginates instead of
   * returning everything, since an operator table with 150+ rows of
   * inline-editable inputs is a real page-weight problem the storefront's
   * card grid never had.
   */
  async list(shopId: string, query: PortalProductListQuery = {}) {
    const { search, category, status } = query;
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));

    const words = (search || '').trim().split(/\s+/).filter(Boolean);
    const wordClauses: Prisma.ProductWhereInput[] = words.map((word) => ({
      OR: [
        { name: { contains: word, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: word, mode: 'insensitive' } } } },
      ],
    }));

    const where: Prisma.ProductWhereInput = {
      shopId,
      ...(category ? { category: { slug: category } } : {}),
      ...(status ? { isActive: status === 'active' } : {}),
      ...(words.length ? { AND: wordClauses } : {}),
    };

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: { variants: true, category: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      products,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** Every category this shop has, active or not -- the portal's own filter
   * dropdown needs to find a product filed under a category the merchant
   * has since deactivated, unlike the storefront's public listCategories
   * (shop.service.ts), which only ever shows active ones to a shopper. */
  listCategories(shopId: string) {
    return this.prisma.productCategory.findMany({ where: { shopId }, orderBy: { name: 'asc' } });
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
