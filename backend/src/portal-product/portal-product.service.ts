import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto, VariantInputDto } from './portal-product.dto';

export type PortalProductListQuery = {
  search?: string;
  category?: string;
  status?: 'active' | 'inactive';
  page?: number;
  pageSize?: number;
};

const VARIANT_ORDER = [{ position: 'asc' as const }, { createdAt: 'asc' as const }];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/** "<product> - <size>", the same shape the synced catalogue's variants already use. */
function variantName(productName: string, size?: string | null): string {
  return size && size.trim() ? `${productName} - ${size.trim()}` : productName;
}

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
        include: { variants: { orderBy: VARIANT_ORDER }, category: true },
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

  // --- shared checks -------------------------------------------------------

  /** A categoryId arrives from the client, so it must be this shop's own -- Product.categoryId is a plain foreign key and would happily point at another shop's category. */
  private async assertCategoryBelongsToShop(shopId: string, categoryId: string) {
    const category = await this.prisma.productCategory.findFirst({ where: { id: categoryId, shopId } });
    if (!category) throw new BadRequestException('That category does not exist in this shop');
  }

  /**
   * SKUs are shop-wide identifiers in practice -- the product feed uses one
   * as each item's id and CSV import matches on it -- but the schema only
   * makes them unique per product, so two products could share one and
   * silently collide there. Enforced here instead.
   */
  private async assertSkusFree(shopId: string, rows: VariantInputDto[], ownProductId?: string) {
    const skus = rows.map((r) => r.sku);
    const dupes = skus.filter((sku, i) => skus.indexOf(sku) !== i);
    if (dupes.length) throw new BadRequestException(`SKU "${dupes[0]}" is used more than once on this product`);

    const clashes = await this.prisma.productVariant.findMany({
      where: {
        sku: { in: skus },
        product: { shopId, ...(ownProductId ? { id: { not: ownProductId } } : {}) },
      },
      select: { sku: true, product: { select: { name: true } } },
      take: 1,
    });
    if (clashes.length) {
      throw new BadRequestException(`SKU "${clashes[0].sku}" is already used by "${clashes[0].product.name}"`);
    }
  }

  private async uniqueSlug(shopId: string, base: string, excludeProductId?: string): Promise<string> {
    const root = slugify(base) || 'product';
    for (let n = 1; n < 100; n++) {
      const candidate = n === 1 ? root : `${root}-${n}`;
      const existing = await this.prisma.product.findFirst({
        where: { shopId, slug: candidate, ...(excludeProductId ? { id: { not: excludeProductId } } : {}) },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    throw new BadRequestException('Could not generate a unique address for this product');
  }

  private async assertSlugFree(shopId: string, slug: string, excludeProductId?: string) {
    const existing = await this.prisma.product.findFirst({
      where: { shopId, slug, ...(excludeProductId ? { id: { not: excludeProductId } } : {}) },
      select: { name: true },
    });
    if (existing) throw new BadRequestException(`The address "${slug}" is already used by "${existing.name}"`);
  }

  // --- reads ---------------------------------------------------------------

  /** One product with its variants in display order -- what the edit screen loads. */
  async get(shopId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, shopId },
      include: { variants: { orderBy: VARIANT_ORDER }, category: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /**
   * What the product form's pickers need beyond categories: the shop's
   * existing brands (so "Nike" isn't re-typed as "nike" and split into two
   * filter chips on the storefront) and every image its products already
   * use. The media library only lists files uploaded into this shop's own
   * storage, so it misses photos that came in by other routes (the synced
   * msa catalogue's live on another host entirely) -- those are exactly the
   * ones worth reusing, hence listing them from the products themselves.
   */
  async meta(shopId: string) {
    const products = await this.prisma.product.findMany({
      where: { shopId },
      select: { name: true, brand: true, imageUrls: true },
      orderBy: { updatedAt: 'desc' },
    });

    const brands = new Map<string, string>();
    const images = new Map<string, { url: string; usedBy: string; count: number }>();
    for (const product of products) {
      const brand = product.brand?.trim();
      if (brand && !brands.has(brand.toLowerCase())) brands.set(brand.toLowerCase(), brand);

      for (const url of Array.isArray(product.imageUrls) ? (product.imageUrls as unknown[]) : []) {
        if (typeof url !== 'string' || !url) continue;
        const entry = images.get(url);
        if (entry) entry.count++;
        else images.set(url, { url, usedBy: product.name, count: 1 });
      }
    }

    return {
      brands: Array.from(brands.values()).sort((a, b) => a.localeCompare(b)),
      images: Array.from(images.values()).slice(0, 300),
    };
  }

  // --- writes --------------------------------------------------------------

  async create(shopId: string, dto: CreateProductDto) {
    if (dto.categoryId) await this.assertCategoryBelongsToShop(shopId, dto.categoryId);
    await this.assertSkusFree(shopId, dto.variants);

    let slug: string;
    if (dto.slug && slugify(dto.slug)) {
      slug = slugify(dto.slug);
      await this.assertSlugFree(shopId, slug);
    } else {
      slug = await this.uniqueSlug(shopId, dto.name);
    }

    return this.prisma.product.create({
      data: {
        shopId,
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        brand: dto.brand?.trim() || null,
        categoryId: dto.categoryId || null,
        imageUrls: dto.imageUrls ?? [],
        isFeatured: dto.isFeatured ?? false,
        isActive: dto.isActive ?? true,
        variants: {
          create: dto.variants.map((v, index) => ({
            sku: v.sku,
            name: v.name?.trim() || variantName(dto.name.trim(), v.size),
            size: v.size?.trim() || null,
            priceKes: v.priceKes,
            wasPriceKes: v.wasPriceKes ?? null,
            stockOnHand: v.stockOnHand ?? 0,
            isActive: v.isActive ?? true,
            position: index,
          })),
        },
      },
      include: { variants: { orderBy: VARIANT_ORDER }, category: true },
    });
  }

  async update(shopId: string, productId: string, data: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, shopId }, include: { variants: true } });
    if (!product) throw new NotFoundException('Product not found');

    if (data.categoryId) await this.assertCategoryBelongsToShop(shopId, data.categoryId);

    const slug = data.slug !== undefined ? slugify(data.slug) : undefined;
    if (data.slug !== undefined && !slug) throw new BadRequestException('The address needs at least one letter or number');
    if (slug && slug !== product.slug) await this.assertSlugFree(shopId, slug, productId);

    const name = data.name?.trim();

    return this.prisma.$transaction(async (tx) => {
      // A derived variant name ("Old name - EUR 40") goes stale on a rename;
      // follow it for variants still carrying the derived form, and leave a
      // name the merchant wrote themselves alone.
      if (name && name !== product.name) {
        for (const variant of product.variants) {
          if (variant.name === variantName(product.name, variant.size)) {
            await tx.productVariant.update({ where: { id: variant.id }, data: { name: variantName(name, variant.size) } });
          }
        }
      }

      return tx.product.update({
        where: { id: productId },
        data: {
          ...(name ? { name } : {}),
          ...(slug ? { slug } : {}),
          ...(data.description !== undefined ? { description: data.description.trim() || null } : {}),
          ...(data.brand !== undefined ? { brand: data.brand.trim() || null } : {}),
          ...(data.categoryId !== undefined ? { categoryId: data.categoryId || null } : {}),
          ...(data.imageUrls !== undefined ? { imageUrls: data.imageUrls } : {}),
          ...(data.isFeatured !== undefined ? { isFeatured: data.isFeatured } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
        include: { variants: { orderBy: VARIANT_ORDER }, category: true },
      });
    });
  }

  /**
   * Saves a product's whole size list in one step, from the form's size
   * table: rows with an id are updated, rows without one are created, and a
   * variant missing from the list is removed.
   *
   * "Removed" depends on history. A variant that orders or WhatsApp leads
   * point at can't be deleted (they reference it, and a receipt must keep
   * showing what was bought), so it is deactivated instead -- gone from the
   * storefront, kept for the records -- and reported back so the form can say
   * so. One nothing references is deleted outright.
   *
   * stockOnHand is only written when the row carries it. The form sends it
   * only for sizes whose stock was actually edited: stock changes by itself
   * as orders are paid, and blindly writing back the number the form loaded
   * would silently undo any sale made while it was open.
   */
  async syncVariants(shopId: string, productId: string, rows: VariantInputDto[]) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, shopId }, include: { variants: true } });
    if (!product) throw new NotFoundException('Product not found');

    const existing = new Map(product.variants.map((v) => [v.id, v]));
    for (const row of rows) {
      if (row.id && !existing.has(row.id)) throw new BadRequestException('One of those sizes does not belong to this product');
    }
    await this.assertSkusFree(shopId, rows, productId);

    const keptIds = new Set(rows.filter((r) => r.id).map((r) => r.id!));
    const removed = product.variants.filter((v) => !keptIds.has(v.id));
    const deactivated: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const variant of removed) {
        const [orderLines, leadLines] = await Promise.all([
          tx.orderLine.count({ where: { variantId: variant.id } }),
          tx.cartLeadLine.count({ where: { variantId: variant.id } }),
        ]);
        if (orderLines + leadLines > 0) {
          // Parked after the live sizes so a hidden one doesn't sit in the
          // middle of the list in the editor.
          await tx.productVariant.update({
            where: { id: variant.id },
            data: { isActive: false, position: rows.length + deactivated.length },
          });
          deactivated.push(variant.size || variant.name);
        } else {
          await tx.productVariant.delete({ where: { id: variant.id } });
        }
      }

      for (const [index, row] of rows.entries()) {
        const data = {
          sku: row.sku,
          size: row.size?.trim() || null,
          name: row.name?.trim() || variantName(product.name, row.size),
          priceKes: row.priceKes,
          wasPriceKes: row.wasPriceKes ?? null,
          position: index,
          ...(row.isActive !== undefined ? { isActive: row.isActive } : {}),
          ...(row.stockOnHand !== undefined ? { stockOnHand: row.stockOnHand } : {}),
        };
        if (row.id) await tx.productVariant.update({ where: { id: row.id }, data });
        else await tx.productVariant.create({ data: { ...data, productId, stockOnHand: row.stockOnHand ?? 0 } });
      }
    });

    return { product: await this.get(shopId, productId), deactivated };
  }

  /** Deleting a product that has been sold or enquired about would orphan its history, so that is refused in favour of deactivating it. */
  async remove(shopId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, shopId }, include: { variants: { select: { id: true } } } });
    if (!product) throw new NotFoundException('Product not found');

    const variantIds = product.variants.map((v) => v.id);
    const [orderLines, leadLines] = await Promise.all([
      this.prisma.orderLine.count({ where: { variantId: { in: variantIds } } }),
      this.prisma.cartLeadLine.count({ where: { variantId: { in: variantIds } } }),
    ]);
    if (orderLines + leadLines > 0) {
      throw new BadRequestException('This product has orders or customer enquiries on record, so it can\'t be deleted. Deactivate it instead to take it off the shop.');
    }

    await this.prisma.product.delete({ where: { id: productId } });
    return { success: true };
  }

  async setActive(shopId: string, productId: string, isActive: boolean) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, shopId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.product.update({ where: { id: productId }, data: { isActive } });
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
