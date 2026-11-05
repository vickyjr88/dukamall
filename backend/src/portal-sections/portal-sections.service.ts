import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SECTIONS, sectionByKey, slugOf } from '../common/sections';
import { cleanSectionKeys, ensureSectionCategories } from '../common/shop-sections';

/** What a shop sells, and the starter categories that go with each section. */
@Injectable()
export class PortalSectionsService {
  constructor(private prisma: PrismaService) {}

  /** Every section, whether this shop sells it, and each starter category with whether the shop already has it. */
  async overview(shopId: string) {
    const [shop, categories, counts] = await Promise.all([
      this.prisma.shop.findUnique({ where: { id: shopId }, select: { sections: true } }),
      this.prisma.productCategory.findMany({ where: { shopId }, select: { id: true, name: true, slug: true, section: true, isActive: true, _count: { select: { products: true } } } }),
      this.prisma.productCategory.count({ where: { shopId, section: null } }),
    ]);
    const enabled = new Set(shop?.sections ?? []);
    const bySlug = new Map(categories.map((c) => [c.slug, c]));
    return {
      // Categories this shop made before sections existed: they keep their sizes, and can be moved into a section by switching it on.
      unsectioned: counts,
      sections: SECTIONS.map((section) => ({
        key: section.key,
        label: section.label,
        tagline: section.tagline,
        axes: section.axes,
        specs: section.specs,
        enabled: enabled.has(section.key),
        categories: section.categories.map((name) => {
          const existing = bySlug.get(slugOf(name));
          return { name, slug: slugOf(name), exists: Boolean(existing), inSection: existing?.section === section.key, products: existing?._count.products ?? 0 };
        }),
        productCount: categories.filter((c) => c.section === section.key).reduce((n, c) => n + c._count.products, 0),
      })),
    };
  }

  /**
   * Switches a section on or off. Switching on creates the starter categories that are missing (all of them unless the owner
   * picked some). Switching off only stops offering it: its categories and products stay exactly as they are.
   */
  async setEnabled(shopId: string, key: string, enabled: boolean, categoryNames?: string[]) {
    const section = sectionByKey(key);
    if (!section) throw new BadRequestException('Unknown section.');
    const result = await this.prisma.$transaction(async (tx) => {
      const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { sections: true } });
      const current = shop?.sections ?? [];
      const next = enabled ? cleanSectionKeys([...current, key]) : current.filter((k) => k !== key);
      await tx.shop.update({ where: { id: shopId }, data: { sections: next } });
      return enabled ? ensureSectionCategories(tx, shopId, key, categoryNames) : { created: [], adopted: [] };
    });
    return { ...result, overview: await this.overview(shopId) };
  }
}
