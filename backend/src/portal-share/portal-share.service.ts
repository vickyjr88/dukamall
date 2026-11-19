import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { productPath } from '../common/follow-up';
import { storefrontOriginForShop } from '../common/storefront-origin';
import { summarise } from '../portal-product/product-list';
import {
  CATALOGUE_MAX, ShareChannel, catalogueMessage, channelHref, cleanTag, isRecordChannel, isShareKind, priceText, productMessage, safePath, tagLink,
} from './share-links';

const PER_HOUR = 300;
const SAME_TAP_MS = 2000;

@Injectable()
export class PortalShareService {
  constructor(private prisma: PrismaService) {}

  private async shop(shopId: string) {
    return this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
  }

  async context(shopId: string) {
    const shop = await this.shop(shopId);
    return { origin: storefrontOriginForShop(shop), shopName: shop.name, whatsappNumber: shop.whatsappNumber ?? null, groupUrl: shop.whatsappGroupUrl ?? null };
  }

  /** The address and message for one product on every channel, each link tagged with where it is going. */
  private channelsFor(origin: string, shopName: string, name: string, price: string, slug: string) {
    const base = `${origin}${productPath({ slug })}`;
    const out: Record<string, unknown> = {};
    for (const channel of ['whatsapp', 'facebook', 'x', 'telegram', 'share', 'link'] as ShareChannel[]) {
      const link = tagLink(base, { source: channel, campaign: 'shop-share' });
      const message = productMessage({ name, priceText: price, link });
      const text = [name, price].filter(Boolean).join(' - ');
      const href = channelHref(channel, { link, text, message });
      out[channel] = { link, message, text, href };
    }
    return out;
  }

  /** Products a shop can share: shown in the shop and in stock (a sold-out product's post only disappoints), newest first. */
  async search(shopId: string, query: { q?: string; page?: number; pageSize?: number }) {
    const shop = await this.shop(shopId);
    const origin = storefrontOriginForShop(shop);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(24, Math.max(1, query.pageSize ?? 12));
    const words = (query.q || '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
    const where: Prisma.ProductWhereInput = {
      shopId, isActive: true,
      variants: { some: { isActive: true, stockOnHand: { gt: 0 } } },
      ...(words.length ? { AND: words.map((w) => ({ OR: [
        { name: { contains: w, mode: 'insensitive' as const } },
        { brand: { contains: w, mode: 'insensitive' as const } },
        { variants: { some: { sku: { contains: w, mode: 'insensitive' as const } } } },
      ] })) } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({ where, include: { variants: true }, orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const items = rows.map((p) => {
      const s = summarise(p);
      const wasKes = Math.max(0, ...p.variants.filter((v) => v.isActive).map((v) => Number(v.wasPriceKes ?? 0)));
      const price = priceText({ minKes: s.minPriceKes, maxKes: s.maxPriceKes, wasKes: s.onOffer ? wasKes : null, currency: shop.currency });
      const images = Array.isArray(p.imageUrls) ? (p.imageUrls as unknown[]).filter((u): u is string => typeof u === 'string') : [];
      return { id: p.id, name: p.name, slug: p.slug, brand: p.brand, imageUrl: images[0] ?? null, priceText: price, onOffer: s.onOffer, isFeatured: p.isFeatured, channels: this.channelsFor(origin, shop.name, p.name, price, p.slug) };
    });
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** One message carrying several products, for a WhatsApp group or broadcast. Only this shop's shown, in-stock products are used; the rest are dropped. */
  async catalogue(shopId: string, ids: unknown) {
    const wanted = Array.isArray(ids) ? Array.from(new Set(ids.filter((i): i is string => typeof i === 'string'))).slice(0, CATALOGUE_MAX) : [];
    if (!wanted.length) throw new BadRequestException('Pick at least one product');
    const shop = await this.shop(shopId);
    const origin = storefrontOriginForShop(shop);
    const rows = await this.prisma.product.findMany({
      where: { shopId, isActive: true, id: { in: wanted }, variants: { some: { isActive: true, stockOnHand: { gt: 0 } } } },
      include: { variants: true },
    });
    if (!rows.length) throw new NotFoundException('None of those products can be shared right now (hidden or sold out)');
    // Keep the order the owner picked them in.
    const order = new Map(wanted.map((id, i) => [id, i]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const items = rows.map((p) => {
      const s = summarise(p);
      const wasKes = Math.max(0, ...p.variants.filter((v) => v.isActive).map((v) => Number(v.wasPriceKes ?? 0)));
      return { name: p.name, priceText: priceText({ minKes: s.minPriceKes, maxKes: s.maxPriceKes, wasKes: s.onOffer ? wasKes : null, currency: shop.currency }), link: tagLink(`${origin}${productPath(p)}`, { source: 'whatsapp', campaign: 'catalogue' }) };
    });
    const message = catalogueMessage({ shopName: shop.name, items, shopLink: tagLink(origin, { source: 'whatsapp', campaign: 'catalogue' }) });
    return { count: items.length, dropped: wanted.length - items.length, message, href: `https://wa.me/?text=${encodeURIComponent(message)}` };
  }

  /** A tagged address for the shop, a product or any page of the shop, for an ad, a bio, a poster or a QR code. */
  async buildLink(shopId: string, input: { target?: string; slug?: string; path?: string; source?: string; medium?: string; campaign?: string }) {
    const shop = await this.shop(shopId);
    const origin = storefrontOriginForShop(shop);
    let path = '/';
    if (input.target === 'product') {
      const product = await this.prisma.product.findFirst({ where: { shopId, slug: String(input.slug ?? '') }, select: { slug: true } });
      if (!product) throw new NotFoundException('Product not found');
      path = productPath(product);
    } else if (input.target === 'path') {
      const safe = safePath(input.path);
      if (!safe) throw new BadRequestException('That is not a page on your shop. Start with one slash, like /pages/about');
      path = safe;
    } else if (input.target && input.target !== 'shop') {
      throw new BadRequestException('Unknown destination');
    }
    const url = tagLink(`${origin}${path}`, { source: cleanTag(input.source, 'link'), medium: cleanTag(input.medium, 'social'), campaign: cleanTag(input.campaign, 'shop-share') });
    return { url };
  }

  /** Counts a tap: where it went and what was shared. Two taps on the same button within two seconds are one; a person is limited to 300 an hour. */
  async record(shopId: string, userEmail: string, input: { channel?: unknown; kind?: unknown; productSlug?: unknown; itemCount?: unknown }) {
    if (!isRecordChannel(input.channel) || !isShareKind(input.kind)) throw new BadRequestException('Unknown channel or kind');
    const slug = typeof input.productSlug === 'string' && /^[a-z0-9-]{1,120}$/i.test(input.productSlug) ? input.productSlug : null;
    const itemCount = Math.min(CATALOGUE_MAX, Math.max(1, Math.floor(Number(input.itemCount) || 1)));
    const now = Date.now();
    const [recent, hour] = await Promise.all([
      this.prisma.shareEvent.findFirst({ where: { shopId, userEmail, channel: input.channel, kind: input.kind, productSlug: slug, createdAt: { gte: new Date(now - SAME_TAP_MS) } }, select: { id: true } }),
      this.prisma.shareEvent.count({ where: { shopId, userEmail, createdAt: { gte: new Date(now - 3600_000) } } }),
    ]);
    if (recent) return { recorded: false };
    if (hour >= PER_HOUR) throw new HttpException('Too many shares this hour', HttpStatus.TOO_MANY_REQUESTS);
    await this.prisma.shareEvent.create({ data: { shopId, userEmail, channel: input.channel, kind: input.kind, productSlug: slug, itemCount } });
    return { recorded: true };
  }

  /** What was shared over the last `days`, by channel and by product, with how many visits those tagged links brought. */
  async stats(shopId: string, days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    const [byChannel, byProduct, byPerson, visits] = await Promise.all([
      this.prisma.shareEvent.groupBy({ by: ['channel'], where: { shopId, createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.shareEvent.groupBy({ by: ['productSlug'], where: { shopId, createdAt: { gte: since }, productSlug: { not: null } }, _count: { _all: true }, orderBy: { _count: { productSlug: 'desc' } }, take: 5 }),
      this.prisma.shareEvent.groupBy({ by: ['userEmail'], where: { shopId, createdAt: { gte: since } }, _count: { _all: true } }),
      // Visits that arrived through a link made here: the campaign tag says so.
      this.prisma.storefrontEvent.findMany({ where: { shopId, type: 'SESSION_START', campaign: { in: ['shop-share', 'catalogue'] }, createdAt: { gte: since } }, select: { sessionId: true } }),
    ]);
    const names = byProduct.length ? await this.prisma.product.findMany({ where: { shopId, slug: { in: byProduct.map((r) => r.productSlug!) } }, select: { slug: true, name: true } }) : [];
    const nameOf = new Map(names.map((n) => [n.slug, n.name]));
    return {
      days,
      total: byChannel.reduce((n, r) => n + r._count._all, 0),
      people: byPerson.length,
      byChannel: byChannel.map((r) => ({ channel: r.channel, count: r._count._all })).sort((a, b) => b.count - a.count),
      topProducts: byProduct.map((r) => ({ slug: r.productSlug!, name: nameOf.get(r.productSlug!) ?? r.productSlug!, count: r._count._all })),
      visitsFromShares: new Set(visits.map((v) => v.sessionId)).size,
    };
  }
}
