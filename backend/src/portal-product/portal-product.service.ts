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

  // Every variant across every product, flattened -- the natural shape for
  // a spreadsheet row (a variant, not a product, is the thing that actually
  // has a price and a stock count). Ordered by product name so a re-export
  // after editing reads back in a stable, predictable order.
  async exportVariantsForCsv(shopId: string) {
    const products = await this.prisma.product.findMany({
      where: { shopId },
      include: { variants: { orderBy: { sku: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    return products.flatMap((p) =>
      p.variants.map((v) => ({
        sku: v.sku,
        productName: p.name,
        variantName: v.name,
        size: v.size ?? '',
        priceKes: Number(v.priceKes),
        wasPriceKes: v.wasPriceKes !== null ? Number(v.wasPriceKes) : '',
        stockOnHand: v.stockOnHand,
        isActive: v.isActive,
      })),
    );
  }

  // Update-only: matches each row to an existing variant by SKU (scoped to
  // this shop, so a SKU typo can never touch another shop's row) and
  // updates price/wasPrice/stock/active in place. Deliberately refuses to
  // create anything -- a CSV can't safely carry a new product's category,
  // slug or images, and a bulk-create path that silently invents malformed
  // products from a spreadsheet a merchant half-filled-in is a worse
  // failure mode than "your new products didn't get created, add them by
  // hand." Rows that don't match a known SKU are reported back, not
  // silently skipped, so a merchant can see what to fix and re-upload.
  async importVariantsFromCsv(shopId: string, rows: Array<{ sku: string; priceKes?: number; wasPriceKes?: number | null; stockOnHand?: number; isActive?: boolean }>) {
    const skus = rows.map((r) => r.sku).filter(Boolean);
    const variants = await this.prisma.productVariant.findMany({
      where: { sku: { in: skus }, product: { shopId } },
    });
    const bySku = new Map(variants.map((v) => [v.sku, v]));

    const updates: Prisma.PrismaPromise<unknown>[] = [];
    const notFound: string[] = [];
    let updatedCount = 0;

    for (const row of rows) {
      const variant = bySku.get(row.sku);
      if (!variant) {
        notFound.push(row.sku);
        continue;
      }
      const data: Prisma.ProductVariantUpdateInput = {};
      if (row.priceKes !== undefined && !Number.isNaN(row.priceKes)) data.priceKes = row.priceKes;
      if (row.wasPriceKes !== undefined) data.wasPriceKes = row.wasPriceKes === null || Number.isNaN(row.wasPriceKes) ? null : row.wasPriceKes;
      if (row.stockOnHand !== undefined && !Number.isNaN(row.stockOnHand)) data.stockOnHand = row.stockOnHand;
      if (row.isActive !== undefined) data.isActive = row.isActive;
      if (Object.keys(data).length === 0) continue;
      updates.push(this.prisma.productVariant.update({ where: { id: variant.id }, data }));
      updatedCount++;
    }

    if (updates.length) await this.prisma.$transaction(updates);
    return { updatedCount, notFound };
  }
}
