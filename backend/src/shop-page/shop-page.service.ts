import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShopPageDto, UpdateShopPageDto } from './shop-page.dto';
import { buildStarterPages, hasPlaceholders } from './starter-pages';
import { storefrontOriginForShop } from '../common/storefront-origin';

const ORDER = [{ position: 'asc' as const }, { createdAt: 'asc' as const }];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

@Injectable()
export class ShopPageService {
  constructor(private prisma: PrismaService) {}

  async list(shopId: string) {
    const pages = await this.prisma.shopPage.findMany({
      where: { shopId },
      orderBy: ORDER,
      select: { id: true, slug: true, title: true, body: true, published: true, showInFooter: true, position: true, updatedAt: true },
    });
    // The body is only read to flag pages that still hold an "[add ...]" marker from a starter page.
    return pages.map(({ body, ...page }) => ({ ...page, needsInput: hasPlaceholders(body) }));
  }

  async get(shopId: string, id: string) {
    const page = await this.prisma.shopPage.findFirst({ where: { id, shopId } });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  /** A free slug for this shop: "about", then "about-2", "about-3"... */
  private async uniqueSlug(shopId: string, base: string, ignoreId?: string) {
    const root = base || 'page';
    for (let n = 1; n < 100; n++) {
      const candidate = n === 1 ? root : `${root.slice(0, 55)}-${n}`;
      const clash = await this.prisma.shopPage.findFirst({
        where: { shopId, slug: candidate, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    throw new ConflictException('Could not find a free address for this page');
  }

  async create(shopId: string, dto: CreateShopPageDto) {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('A page needs a title');
    // An explicitly chosen slug is taken as-is or refused; only a generated one is de-duplicated.
    let slug: string;
    if (dto.slug) {
      const clash = await this.prisma.shopPage.findFirst({ where: { shopId, slug: dto.slug }, select: { id: true } });
      if (clash) throw new ConflictException('Another page already uses that address');
      slug = dto.slug;
    } else {
      slug = await this.uniqueSlug(shopId, slugify(title));
    }
    const last = await this.prisma.shopPage.aggregate({ where: { shopId }, _max: { position: true } });
    return this.prisma.shopPage.create({
      data: {
        shopId,
        slug,
        title,
        body: dto.body ?? '',
        published: dto.published ?? true,
        showInFooter: dto.showInFooter ?? true,
        position: (last._max.position ?? -1) + 1,
      },
    });
  }

  async update(shopId: string, id: string, dto: UpdateShopPageDto) {
    await this.get(shopId, id);
    if (dto.slug) {
      const clash = await this.prisma.shopPage.findFirst({ where: { shopId, slug: dto.slug, NOT: { id } }, select: { id: true } });
      if (clash) throw new ConflictException('Another page already uses that address');
    }
    const title = dto.title?.trim();
    if (dto.title !== undefined && !title) throw new BadRequestException('A page needs a title');
    return this.prisma.shopPage.update({
      where: { id },
      data: {
        ...(title ? { title } : {}),
        ...(dto.slug ? { slug: dto.slug } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.published !== undefined ? { published: dto.published } : {}),
        ...(dto.showInFooter !== undefined ? { showInFooter: dto.showInFooter } : {}),
      },
    });
  }

  async remove(shopId: string, id: string) {
    await this.get(shopId, id);
    await this.prisma.shopPage.delete({ where: { id } });
    return { ok: true };
  }

  /** Swap a page with its neighbour in the footer/list order. */
  async move(shopId: string, id: string, direction: 'up' | 'down') {
    const pages = await this.prisma.shopPage.findMany({ where: { shopId }, orderBy: ORDER, select: { id: true } });
    const index = pages.findIndex((p) => p.id === id);
    if (index === -1) throw new NotFoundException('Page not found');
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= pages.length) return this.list(shopId);
    const ids = pages.map((p) => p.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    // Rewrite every position so ties (all zeros from older rows) can't leave the order ambiguous.
    await this.prisma.$transaction(ids.map((pid, position) => this.prisma.shopPage.update({ where: { id: pid }, data: { position } })));
    return this.list(shopId);
  }

  /**
   * Adds whichever starter pages the shop doesn't have yet, unpublished, filled in from the
   * shop's Store info (see starter-pages.ts). Existing pages are never touched.
   */
  async addStarters(shopId: string) {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    const existing = new Set((await this.prisma.shopPage.findMany({ where: { shopId }, select: { slug: true } })).map((p) => p.slug));
    const last = await this.prisma.shopPage.aggregate({ where: { shopId }, _max: { position: true } });
    let position = (last._max.position ?? -1) + 1;
    const missing = buildStarterPages({
      name: shop.name,
      website: storefrontOriginForShop(shop),
      address: shop.address,
      openingHours: shop.openingHours,
      contactPhone: shop.contactPhone,
      whatsappNumber: shop.whatsappNumber,
      contactEmail: shop.contactEmail,
    }).filter((s) => !existing.has(s.slug));
    for (const starter of missing) {
      await this.prisma.shopPage.create({
        data: { shopId, slug: starter.slug, title: starter.title, body: starter.body, published: false, showInFooter: true, position: position++ },
      });
    }
    return { added: missing.length };
  }

  // ---- storefront (public) ------------------------------------------------

  listPublished(shopId: string) {
    return this.prisma.shopPage.findMany({
      where: { shopId, published: true },
      orderBy: ORDER,
      select: { slug: true, title: true, showInFooter: true, updatedAt: true },
    });
  }

  async getPublished(shopId: string, slug: string) {
    const page = await this.prisma.shopPage.findFirst({
      where: { shopId, slug, published: true },
      select: { slug: true, title: true, body: true, updatedAt: true },
    });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }
}
