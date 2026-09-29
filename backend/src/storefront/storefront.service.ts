import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ProductListQuery = {
  category?: string;
  brand?: string;
  size?: string;
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
};

@Injectable()
export class StorefrontService {
  constructor(private prisma: PrismaService) {}

  /**
   * The catalogue, filtered/sorted for the home page's search bar (design
   * doc: comprehensive search and filtering). Mirrors drip-crm's own
   * storefront list() -- same literal-then-fuzzy search strategy and
   * post-fetch price filtering -- simplified for this schema: a flat
   * ProductCategory (no tree to walk) and a real ProductVariant.size column
   * (no JSON attributes bag to unnest for it).
   */
  async listProducts(shopId: string, query: ProductListQuery = {}) {
    const { category, brand, size, search, minPrice, maxPrice, sort } = query;

    // Split on whitespace and require every word to match something, in any
    // order -- a single contains on the whole phrase means "nike air" finds
    // nothing against a product named "Air Force 1 Nike Edition".
    const words = (search || '').trim().split(/\s+/).filter(Boolean);
    const wordClauses: Prisma.ProductWhereInput[] = words.map((word) => ({
      OR: [
        { name: { contains: word, mode: 'insensitive' } },
        { brand: { contains: word, mode: 'insensitive' } },
        { description: { contains: word, mode: 'insensitive' } },
        { category: { name: { contains: word, mode: 'insensitive' } } },
        { variants: { some: { sku: { contains: word, mode: 'insensitive' }, isActive: true } } },
      ],
    }));

    // The fuzzy pass is a fallback, not an extra OR branch: it only runs
    // (and only matters) when the literal pass above finds nothing, so a
    // query that already works is never widened into something looser.
    const literalCount = words.length
      ? await this.prisma.product.count({
          where: {
            shopId,
            isActive: true,
            ...(category ? { category: { slug: category } } : {}),
            ...(brand ? { brand: { equals: brand, mode: 'insensitive' } } : {}),
            AND: wordClauses,
          },
        })
      : 0;
    const fuzzyIds = words.length && literalCount === 0 ? await this.fuzzyProductIds(shopId, words) : [];

    const where: Prisma.ProductWhereInput = {
      shopId,
      isActive: true,
      ...(category ? { category: { slug: category } } : {}),
      ...(brand ? { brand: { equals: brand, mode: 'insensitive' } } : {}),
      ...(size ? { variants: { some: { size, isActive: true } } } : {}),
      ...(words.length
        ? fuzzyIds.length
          ? { id: { in: fuzzyIds } }
          : { AND: wordClauses }
        : {}),
    };

    const products = await this.prisma.product.findMany({
      where,
      include: { variants: { where: { isActive: true } }, category: true },
      orderBy: { createdAt: 'desc' },
    });

    // Price filters run after the fetch because "price" is the cheapest
    // active variant's price, not a column on Product itself.
    const cheapest = (p: (typeof products)[number]) =>
      p.variants.length ? Math.min(...p.variants.map((v) => Number(v.priceKes))) : 0;
    let results = products;
    if (minPrice) results = results.filter((p) => cheapest(p) >= Number(minPrice));
    if (maxPrice) results = results.filter((p) => cheapest(p) <= Number(maxPrice));

    const comparators: Record<string, (a: (typeof products)[number], b: (typeof products)[number]) => number> = {
      'price-asc': (a, b) => cheapest(a) - cheapest(b),
      'price-desc': (a, b) => cheapest(b) - cheapest(a),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    const comparator = comparators[sort || ''];
    if (comparator) results = [...results].sort(comparator);

    return results;
  }

  /**
   * Typo-tolerant fallback used only when a literal search finds nothing.
   * Simplified from drip-crm's own fuzzyProductIds: this schema has no
   * category tree or JSON attributes bag to route around, so it only needs
   * to check name/brand against pg_trgm's similarity() -- see the
   * add_pg_trgm migration for the extension this depends on.
   */
  private async fuzzyProductIds(shopId: string, words: string[]): Promise<string[]> {
    if (words.length === 0) return [];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT p.id
      FROM "Product" p
      CROSS JOIN LATERAL unnest(${words}::text[]) AS q(word)
      CROSS JOIN LATERAL unnest(
        string_to_array(lower(p.name) || ' ' || lower(coalesce(p.brand, '')), ' ')
      ) AS t(part)
      WHERE p."shopId" = ${shopId} AND p."isActive" = true AND similarity(t.part, q.word) > 0.3
    `;
    return rows.map((row) => row.id);
  }

  /**
   * Distinct brand/size values actually present in this shop's active
   * catalogue, for the search bar's filter dropdowns/chips -- so a shop
   * with no watches never shows a "size" chip for shoe sizes, and vice
   * versa.
   */
  async filters(shopId: string) {
    const [brands, sizes] = await Promise.all([
      this.prisma.product.findMany({
        where: { shopId, isActive: true, brand: { not: null } },
        distinct: ['brand'],
        select: { brand: true },
        orderBy: { brand: 'asc' },
      }),
      this.prisma.productVariant.findMany({
        where: { isActive: true, size: { not: null }, product: { shopId, isActive: true } },
        distinct: ['size'],
        select: { size: true },
        orderBy: { size: 'asc' },
      }),
    ]);
    return {
      brands: brands.map((b) => b.brand!).filter(Boolean),
      sizes: sizes.map((s) => s.size!).filter(Boolean),
    };
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
