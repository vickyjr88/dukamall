import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Slug is derived from the name, not merchant-supplied -- categories are a
// short, low-cardinality list (unlike products, which already ask a
// merchant to type a slug), so asking for a second field here would just be
// friction for no real benefit. Re-derived on rename too, since a category
// with a stale slug from an old name would silently break the storefront's
// ?category= filter links.
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class PortalCategoryService {
  constructor(private prisma: PrismaService) {}

  list(shopId: string) {
    return this.prisma.productCategory.findMany({
      where: { shopId },
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(shopId: string, name: string) {
    const slug = slugify(name);
    if (!slug) throw new BadRequestException('Category name must contain at least one letter or number');
    const existing = await this.prisma.productCategory.findUnique({ where: { shopId_slug: { shopId, slug } } });
    if (existing) throw new BadRequestException('A category with this name already exists');
    return this.prisma.productCategory.create({ data: { shopId, name: name.trim(), slug } });
  }

  async rename(shopId: string, categoryId: string, name: string) {
    const category = await this.prisma.productCategory.findFirst({ where: { id: categoryId, shopId } });
    if (!category) throw new NotFoundException('Category not found');
    const slug = slugify(name);
    if (!slug) throw new BadRequestException('Category name must contain at least one letter or number');
    if (slug !== category.slug) {
      const existing = await this.prisma.productCategory.findUnique({ where: { shopId_slug: { shopId, slug } } });
      if (existing) throw new BadRequestException('A category with this name already exists');
    }
    return this.prisma.productCategory.update({ where: { id: categoryId }, data: { name: name.trim(), slug } });
  }

  async setActive(shopId: string, categoryId: string, isActive: boolean) {
    const category = await this.prisma.productCategory.findFirst({ where: { id: categoryId, shopId } });
    if (!category) throw new NotFoundException('Category not found');
    return this.prisma.productCategory.update({ where: { id: categoryId }, data: { isActive } });
  }

  // Deleting outright (not just deactivating) is only offered when nothing
  // references it -- Product.categoryId is nullable, so Prisma wouldn't
  // actually fail here, but a delete that silently orphans every product in
  // that category is a footgun a merchant didn't ask for. isActive exists
  // precisely so "hide this category" doesn't need a destructive delete.
  async remove(shopId: string, categoryId: string) {
    const category = await this.prisma.productCategory.findFirst({
      where: { id: categoryId, shopId },
      include: { _count: { select: { products: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category._count.products > 0) {
      throw new BadRequestException('Move or remove the products in this category first, or deactivate it instead of deleting it');
    }
    await this.prisma.productCategory.delete({ where: { id: categoryId } });
    return { success: true };
  }
}
