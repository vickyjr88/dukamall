import { Injectable } from '@nestjs/common';
import { optionGroups, optionEntries, Attributes } from '../common/variant-options';
import { PrismaService } from '../prisma/prisma.service';
import { OptionGroup, PostableProduct } from './social-post';

/**
 * What a shop could post right now, in the shape the engine needs: products a shopper can buy (active, in a live category, at least one
 * variant in stock), with a photo and a price, at the price a shopper pays today (a running sale included). The options are the ones
 * still in stock, by the shop's own section: sizes for shoes and clothes, storage and colour for phones, a version for a watch.
 *
 * Everything is the shop's own: another shop's products are never read.
 */
@Injectable()
export class PostableProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async forShop(shopId: string): Promise<Array<Omit<PostableProduct, 'imageUrl'> & { imageUrl: string | null }>> {
    const products = await this.prisma.product.findMany({
      where: { shopId, isActive: true, OR: [{ categoryId: null }, { category: { isActive: true } }] },
      include: { category: { select: { name: true, section: true } }, variants: { where: { isActive: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });

    const out: Array<Omit<PostableProduct, 'imageUrl'> & { imageUrl: string | null }> = [];
    for (const product of products) {
      const inStock = product.variants.filter((v) => v.stockOnHand > 0);
      if (!inStock.length) continue;
      const prices = inStock.map((v) => Number(v.priceKes));
      const sale = inStock.filter((v) => v.wasPriceKes !== null && Number(v.wasPriceKes) > Number(v.priceKes)).sort((a, b) => Number(a.priceKes) - Number(b.priceKes))[0];
      const gallery: string[] = Array.isArray(product.imageUrls) ? (product.imageUrls as string[]).filter((u) => typeof u === 'string') : [];
      out.push({
        id: product.id, slug: product.slug, name: product.name, brand: product.brand ?? null,
        categoryName: product.category?.name ?? null, section: product.category?.section ?? null,
        imageUrl: gallery[0] ?? null,
        priceFrom: Math.min(...prices), priceTo: Math.max(...prices),
        offer: sale ? { price: Number(sale.priceKes), was: Number(sale.wasPriceKes) } : null,
        options: this.optionsOf(inStock),
        stockUnits: inStock.reduce((n, v) => n + v.stockOnHand, 0),
        createdAt: product.createdAt,
      });
    }
    return out;
  }

  /**
   * The options of the variants still in stock, one group per kind, values in the order the shop entered them. A variant that predates
   * options carries only its plain `size`, which counts as a size. A product with no options at all gives no groups.
   */
  private optionsOf(variants: Array<{ attributes: unknown; size: string | null }>): OptionGroup[] {
    const asAttributes = (v: { attributes: unknown; size: string | null }): Attributes => {
      const entries = optionEntries(v.attributes as Attributes | null);
      if (entries.length) return Object.fromEntries(entries);
      return v.size?.trim() ? { size: v.size.trim() } : {};
    };
    return optionGroups(variants.map((v) => ({ attributes: asAttributes(v) })));
  }
}
