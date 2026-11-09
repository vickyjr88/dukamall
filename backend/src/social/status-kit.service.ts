import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PostableProductsService } from './postable-products.service';
import { fetchPhoto } from './photo-fetch';
import { PostableProduct, buildStatusCaption, isPostable, nairobiParts, pickProduct } from './social-post';
import { renderStatusImage } from './status-image';
import { statusPalette } from './status-palette';

const CHANNEL = 'STATUS';
/** A Status disappears after a day, so a product may come round again sooner than on a feed. */
const MAX_COOLDOWN_DAYS = 14;
export const DEFAULT_KIT_SIZE = 3;
export const MAX_KIT_SIZE = 8;

/**
 * WhatsApp has no way to post a Status automatically, so this prepares it, for every shop on its own: each day a few of the shop's products are chosen
 * the way its Page posts are (in stock, with a photo, not shown lately; a separate rotation) and for each one a ready 9:16 picture in the shop's colours
 * and its text are made. Staff open the "WhatsApp Status" screen on their phone, share each picture straight into WhatsApp > My status, and mark it
 * posted, which moves that product to the back of the line. The day's kit is made once and stays the same until the next day.
 *
 * Needs no connection to Meta: nothing leaves the server.
 */
@Injectable()
export class StatusKitService {
  constructor(private readonly prisma: PrismaService, private readonly products: PostableProductsService) {}

  private async candidates(shopId: string): Promise<PostableProduct[]> {
    return (await this.products.forShop(shopId)).filter(isPostable) as PostableProduct[];
  }

  async size(shopId: string): Promise<number> {
    const row = await this.prisma.socialSetting.findUnique({ where: { shopId }, select: { statusKitCount: true } });
    return Math.min(MAX_KIT_SIZE, Math.max(1, row?.statusKitCount ?? DEFAULT_KIT_SIZE));
  }

  /** How many pictures a day (owner). Takes effect for what is not made yet: today's kit is never cut down, only added to. */
  async setSize(shopId: string, count: number, by: string) {
    const statusKitCount = Math.min(MAX_KIT_SIZE, Math.max(1, Math.round(count)));
    await this.prisma.socialSetting.upsert({ where: { shopId }, create: { shopId, statusKitCount, updatedBy: by }, update: { statusKitCount, updatedBy: by } });
    return { count: statusKitCount };
  }

  private async lastPosted(shopId: string): Promise<Map<string, Date>> {
    const rows = await this.prisma.socialPost.groupBy({ by: ['productId'], where: { shopId, channel: CHANNEL, status: 'POSTED', productId: { not: null } }, _max: { postedAt: true } });
    const map = new Map<string, Date>();
    for (const r of rows) if (r.productId && r._max.postedAt) map.set(r.productId, r._max.postedAt);
    return map;
  }

  /** The next product, never one already in today's kit. */
  private async choose(shopId: string, candidates: PostableProduct[], exclude: Set<string>): Promise<PostableProduct | null> {
    const settings = await this.prisma.socialSetting.findUnique({ where: { shopId }, select: { cooldownDays: true } });
    const cooldown = Math.min(settings?.cooldownDays ?? 30, MAX_COOLDOWN_DAYS);
    return pickProduct({ candidates: candidates.filter((p) => !exclude.has(p.id)), lastPosted: await this.lastPosted(shopId), lastBrand: null, now: new Date(), cooldownDays: cooldown });
  }

  private dayRows(shopId: string, day: string) {
    return this.prisma.socialPost.findMany({ where: { shopId, channel: CHANNEL, slotKey: { startsWith: `${day}#` } }, orderBy: { slotKey: 'asc' } });
  }

  /** Today's kit, made on first use. Each item carries its text as it reads now, so a price changed since the morning is not stale. */
  async today(shopId: string, by = 'system') {
    const day = nairobiParts(new Date()).day;
    const candidates = await this.candidates(shopId);
    const ctx = await this.products.contextFor(shopId);
    let rows = await this.dayRows(shopId, day);
    const wanted = await this.size(shopId);
    if (rows.length < wanted) {
      const taken = new Set(rows.map((r) => r.productId).filter((id): id is string => Boolean(id)));
      for (let n = 1; n <= wanted; n += 1) {
        const slotKey = `${day}#${n}`;
        if (rows.some((r) => r.slotKey === slotKey)) continue;
        const product = await this.choose(shopId, candidates, taken);
        if (!product) break;
        taken.add(product.id);
        try {
          await this.prisma.socialPost.create({
            data: {
              shopId, channel: CHANNEL, slotKey, status: 'READY', triggeredBy: by, productId: product.id, productName: product.name, productSlug: product.slug,
              imageUrl: product.imageUrl, caption: buildStatusCaption(product, ctx),
            },
          });
        } catch (error) {
          // Another request (or backend slot) made this one a moment ago: use theirs.
          if ((error as { code?: string }).code !== 'P2002') throw error;
        }
      }
      rows = await this.dayRows(shopId, day);
    }

    const live = new Map(candidates.map((p) => [p.id, p]));
    return rows.map((r) => {
      const product = r.productId ? live.get(r.productId) : undefined;
      return {
        id: r.id, status: r.status, productName: r.productName, productSlug: r.productSlug, postedAt: r.postedAt,
        // Gone from the shelf since the morning: still shown, but flagged, and its picture is no longer made.
        available: Boolean(product),
        caption: product ? buildStatusCaption(product, ctx) : r.caption,
      };
    });
  }

  /** The kit item, only if it is this shop's: another shop's id is "not found", never "forbidden". */
  private async row(shopId: string, id: string) {
    const row = await this.prisma.socialPost.findFirst({ where: { id, shopId, channel: CHANNEL } });
    if (!row) throw new NotFoundException('That Status is not in the kit');
    return row;
  }

  /** The 1080x1920 picture for one item, in the shop's colours. */
  async image(shopId: string, id: string): Promise<Buffer> {
    const row = await this.row(shopId, id);
    const product = (await this.candidates(shopId)).find((p) => p.id === row.productId);
    if (!product) throw new NotFoundException('That product is no longer in stock with a photo. Swap it for another.');
    const [ctx, theme] = await Promise.all([this.products.contextFor(shopId), this.prisma.shopTheme.findUnique({ where: { shopId } })]);
    return renderStatusImage(product, await fetchPhoto(product.imageUrl), { shopName: ctx.shopName, whatsapp: ctx.whatsapp, site: ctx.origin, palette: statusPalette(theme?.primaryColor, theme?.accentColor) });
  }

  /** Replaces one item with the next product in line. */
  async swap(shopId: string, id: string) {
    const row = await this.row(shopId, id);
    if (row.status === 'POSTED') return this.today(shopId);
    const day = row.slotKey.split('#')[0];
    const others = await this.dayRows(shopId, day);
    const candidates = await this.candidates(shopId);
    const product = await this.choose(shopId, candidates, new Set(others.map((o) => o.productId).filter((p): p is string => Boolean(p))));
    if (!product) return this.today(shopId);
    const ctx = await this.products.contextFor(shopId);
    await this.prisma.socialPost.update({
      where: { id },
      data: { productId: product.id, productName: product.name, productSlug: product.slug, imageUrl: product.imageUrl, caption: buildStatusCaption(product, ctx), status: 'READY' },
    });
    return this.today(shopId);
  }

  /** Staff posted it on WhatsApp: it goes to the back of the line, and tomorrow's kit will not repeat it. */
  async markPosted(shopId: string, id: string, by: string) {
    const row = await this.row(shopId, id);
    if (row.status !== 'POSTED') await this.prisma.socialPost.update({ where: { id }, data: { status: 'POSTED', postedAt: new Date(), triggeredBy: by } });
    return this.today(shopId);
  }
}
