import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { storefrontOriginForShop } from '../common/storefront-origin';
import { isTransientFacebookError } from '../facebook/facebook-comments';
import { IntegrationsService, ResolvedConnection } from '../integrations/integrations.service';
import { WhatsAppClient } from '../integrations/whatsapp-client';
import { PrismaService } from '../prisma/prisma.service';
import { PostableProductsService } from './postable-products.service';
import { PostContext, PostableProduct, buildCaption, buildThreadsCaption, cleanTimes, dueSlots, isPostable, nairobiParts, nextSlot, pickProduct } from './social-post';

const TICK_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 4 * 60_000;
/** A post stuck PENDING (the backend stopped mid-post) is looked at again after this long. */
const STUCK_AFTER_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
const GRAPH = 'https://graph.facebook.com/v21.0';
const THREADS_API = 'https://graph.threads.net/v1.0';
/** Renew a Threads token when it has less than this left (it lasts 60 days). */
const THREADS_RENEW_BEFORE_MS = 20 * DAY_MS;

export type Channel = 'FACEBOOK' | 'THREADS';
export const CHANNELS: Channel[] = ['FACEBOOK', 'THREADS'];
const providerOf = (channel: Channel): IntegrationProvider => channel;

/** Switch for the whole engine on this server, whatever any shop has set. `SOCIAL_POSTING=false` stops every post at once. Not a secret, so it may stay in the environment. */
export const socialPostingAllowed = () => (process.env.SOCIAL_POSTING || 'true') !== 'false';

export type SocialSettings = { facebookEnabled: boolean; threadsEnabled: boolean; times: string[]; cooldownDays: number; updatedBy: string };
const DEFAULTS: SocialSettings = { facebookEnabled: false, threadsEnabled: false, times: ['09:00', '13:00', '19:00'], cooldownDays: 30, updatedBy: 'system' };

type Posted = { ok: true; id: string; permalink?: string } | { ok: false; error: string; transient: boolean };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The marketing engine, for every shop on its own: at the shop's set times each day it picks one of the shop's products that is in stock with
 * a photo and has not been posted lately, writes the post (photo, name, price, what is in stock, a tagged link, the shop's WhatsApp and
 * address) and publishes it to the shop's own Facebook Page and Threads account, each switched on separately. Visits from the links show in
 * Insights as Facebook or Threads.
 *
 * Fully automatic, so the guards matter: off until the owner turns a channel on; only products a shopper can buy right now; never the same
 * product within the cooldown on a channel; no more than the number of times set (six at most); a slot missed by more than 90 minutes is
 * dropped, not posted late; a slot is claimed in the database, so two backend slots post it once; rotation, caps and rows are per shop.
 * `SOCIAL_POSTING=false` overrides everything. A bad post can be taken down from the screen.
 */
@Injectable()
export class SocialPostingService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SocialPostingService.name);
  private timer?: NodeJS.Timeout;
  /** shopId -> when a Threads renewal was last tried, so a refusal is not retried on every check. */
  private readonly lastRenewTry = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly products: PostableProductsService,
  ) {}

  onApplicationBootstrap() {
    if (!socialPostingAllowed()) return;
    this.timer = setInterval(() => void this.safeTick(), TICK_MS);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async safeTick() {
    try {
      await this.tick();
    } catch (error) {
      this.logger.error(`Social posting check failed: ${(error as Error).message}`);
    }
  }

  // --- settings ---------------------------------------------------------------------------------------------------------

  async getSettings(shopId: string): Promise<SocialSettings> {
    const row = await this.prisma.socialSetting.findUnique({ where: { shopId } });
    return row
      ? { facebookEnabled: row.facebookEnabled, threadsEnabled: row.threadsEnabled, times: cleanTimes(row.times), cooldownDays: row.cooldownDays, updatedBy: row.updatedBy }
      : DEFAULTS;
  }

  private enabled(settings: SocialSettings, channel: Channel) {
    return channel === 'FACEBOOK' ? settings.facebookEnabled : settings.threadsEnabled;
  }

  async updateSettings(shopId: string, patch: Partial<SocialSettings>, updatedBy: string) {
    const current = await this.getSettings(shopId);
    const next = {
      facebookEnabled: patch.facebookEnabled ?? current.facebookEnabled,
      threadsEnabled: patch.threadsEnabled ?? current.threadsEnabled,
      times: patch.times ? cleanTimes(patch.times) : current.times,
      cooldownDays: patch.cooldownDays ?? current.cooldownDays,
      updatedBy,
    };
    await this.prisma.socialSetting.upsert({ where: { shopId }, create: { shopId, ...next }, update: next });
    return this.status(shopId);
  }

  // --- the channels' APIs -----------------------------------------------------------------------------------------------

  private failure(r: { status: number; data: any } | null) {
    if (!r) return { ok: false as const, error: 'The service could not be reached', transient: true };
    const e = r.data?.error;
    const code = typeof e?.code === 'number' ? e.code : undefined;
    return { ok: false as const, error: [code, e?.error_user_msg || e?.message || `HTTP ${r.status}`].filter((x) => x !== undefined).join(': ').slice(0, 400), transient: isTransientFacebookError(code, r.status) };
  }

  private async call(url: string, init: RequestInit, label: string) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) });
      return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
    } catch (error) {
      // The label, never the address: a Threads address carries the token.
      this.logger.warn(`${label} failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private fb(token: string, path: string, body: unknown, method: 'POST' | 'DELETE' = 'POST') {
    return this.call(`${GRAPH}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    }, `Facebook ${path}`);
  }

  /** A photo post on the shop's Page: the product's picture with the text as its caption. */
  private async publishFacebook(conn: ResolvedConnection, imageUrl: string, caption: string): Promise<Posted> {
    const r = await this.fb(conn.secrets.pageAccessToken, `${conn.config.pageId}/photos`, { url: imageUrl, caption, published: true });
    const id = r?.data?.post_id || r?.data?.id;
    return r && r.status < 300 && id ? { ok: true, id: String(id), permalink: `https://www.facebook.com/${id}` } : this.failure(r);
  }

  // Threads ------------------------------------------------------------------------------------------------------------

  private async th(path: string, token: string, method: 'GET' | 'POST' | 'DELETE', body?: Record<string, string>) {
    const label = `Threads ${path.replace(/\/\d+/g, '/{id}')}`;
    if (method === 'POST') {
      return this.call(`${THREADS_API}/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, access_token: token }) }, label);
    }
    const query = new URLSearchParams({ ...(body ?? {}), access_token: token });
    return this.call(`${THREADS_API}/${path}?${query}`, { method }, label);
  }

  /**
   * Finds the shop's Threads account from its token if that is not known yet, and renews the token when it is within 20 days of ending. A
   * Threads token lasts 60 days; the renewed one is written back to the SHOP'S OWN connection (Portal > Connections), which is where the
   * owner sees when it ends. A renewal that is refused (the token is under a day old) is not fatal: the current one works until it ends.
   */
  async maintainThreadsLogin(shopId: string, now: Date = new Date()): Promise<void> {
    const conn = await this.integrations.resolve(shopId, 'THREADS');
    if (!conn) return;
    const token = conn.secrets.accessToken;

    let userId = conn.externalId;
    if (!userId) {
      const me = await this.th('me', token, 'GET', { fields: 'id,username' });
      userId = me && me.status < 300 && me.data?.id ? String(me.data.id) : null;
      if (!userId) { await this.integrations.updateStored(shopId, 'THREADS', { lastError: this.failure(me).error }); return; }
      await this.integrations.updateStored(shopId, 'THREADS', { externalId: userId, config: { userId } });
    }

    const expiresAt = conn.tokenExpiresAt ?? null;
    const needsRenewal = !expiresAt || expiresAt.getTime() - now.getTime() < THREADS_RENEW_BEFORE_MS;
    // Tried at most once an hour: the renewal is refused for a token under a day old, and a failure should not hammer the service.
    if (!needsRenewal || now.getTime() - (this.lastRenewTry.get(shopId) ?? 0) < 3_600_000) return;
    this.lastRenewTry.set(shopId, now.getTime());

    const r = await this.th('refresh_access_token', token, 'GET', { grant_type: 'th_refresh_token' });
    if (r && r.status < 300 && r.data?.access_token) {
      const seconds = Number(r.data.expires_in) || 60 * 86_400;
      const ends = new Date(now.getTime() + seconds * 1000);
      await this.integrations.updateStored(shopId, 'THREADS', { secrets: { accessToken: String(r.data.access_token) }, tokenExpiresAt: ends, lastError: null });
      this.logger.log(`Shop ${shopId}: Threads login renewed; good until ${ends.toISOString().slice(0, 10)}.`);
    } else {
      await this.integrations.updateStored(shopId, 'THREADS', { lastError: `Renewal: ${this.failure(r).error}` });
      if (expiresAt && expiresAt.getTime() - now.getTime() < 7 * DAY_MS) this.logger.warn(`Shop ${shopId}: the Threads login ends ${expiresAt.toISOString().slice(0, 10)} and could not be renewed.`);
    }
  }

  /** A photo post on Threads: make the item, wait until Threads has fetched the picture, then publish it. */
  private async publishThreads(shopId: string, conn: ResolvedConnection, imageUrl: string, text: string): Promise<Posted> {
    let c = conn;
    if (!c.externalId) {
      await this.maintainThreadsLogin(shopId);
      c = (await this.integrations.resolve(shopId, 'THREADS')) ?? conn;
    }
    if (!c.externalId) return { ok: false, error: 'The Threads account could not be identified from the token', transient: false };
    const token = c.secrets.accessToken;
    const userId = c.externalId;

    const made = await this.th(`${userId}/threads`, token, 'POST', { media_type: 'IMAGE', image_url: imageUrl, text });
    const creationId = made?.data?.id;
    if (!made || made.status >= 300 || !creationId) return this.failure(made);

    // Threads fetches the picture before the item can be published; its own advice is to wait about half a minute.
    const waitUntil = Date.now() + Number(process.env.SOCIAL_PUBLISH_WAIT_MS || 60_000);
    for (;;) {
      const s = await this.th(String(creationId), token, 'GET', { fields: 'status,error_message' });
      const state = s?.data?.status;
      if (state === 'FINISHED') break;
      if (state === 'ERROR' || state === 'EXPIRED') return { ok: false, error: `Threads could not use the picture: ${s?.data?.error_message || state}`, transient: false };
      if (Date.now() >= waitUntil) return { ok: false, error: 'Threads was still preparing the post; it will be tried again', transient: true };
      await sleep(Number(process.env.SOCIAL_POLL_MS || 3_000));
    }

    const published = await this.th(`${userId}/threads_publish`, token, 'POST', { creation_id: String(creationId) });
    const id = published?.data?.id;
    if (!published || published.status >= 300 || !id) return this.failure(published);
    const link = await this.th(String(id), token, 'GET', { fields: 'permalink' });
    return { ok: true, id: String(id), permalink: link?.data?.permalink ? String(link.data.permalink) : undefined };
  }

  private async publishTo(shopId: string, channel: Channel, imageUrl: string, caption: string): Promise<Posted> {
    const conn = await this.integrations.resolve(shopId, providerOf(channel));
    if (!conn) return { ok: false, error: `${channel === 'FACEBOOK' ? 'Facebook' : 'Threads'} is not connected for this shop.`, transient: false };
    return channel === 'FACEBOOK' ? this.publishFacebook(conn, imageUrl, caption) : this.publishThreads(shopId, conn, imageUrl, caption);
  }

  // --- choosing ---------------------------------------------------------------------------------------------------------

  private async candidates(shopId: string): Promise<PostableProduct[]> {
    return (await this.products.forShop(shopId)).filter(isPostable) as PostableProduct[];
  }

  private async lastPosted(shopId: string, channel: Channel): Promise<{ map: Map<string, Date>; lastProductId: string | null }> {
    const rows = await this.prisma.socialPost.groupBy({ by: ['productId'], where: { shopId, channel, status: 'POSTED', productId: { not: null } }, _max: { postedAt: true } });
    const map = new Map<string, Date>();
    for (const r of rows) if (r.productId && r._max.postedAt) map.set(r.productId, r._max.postedAt);
    const last = await this.prisma.socialPost.findFirst({ where: { shopId, channel, status: 'POSTED' }, orderBy: { postedAt: 'desc' }, select: { productId: true } });
    return { map, lastProductId: last?.productId ?? null };
  }

  private async choose(shopId: string, channel: Channel, now: Date, cooldownDays: number, productId?: string) {
    const candidates = await this.candidates(shopId);
    if (productId) return candidates.find((p) => p.id === productId) ?? null;
    const { map, lastProductId } = await this.lastPosted(shopId, channel);
    const lastBrand = candidates.find((p) => p.id === lastProductId)?.brand ?? null;
    return pickProduct({ candidates, lastPosted: map, lastBrand, now, cooldownDays });
  }

  /** The shop's own name, WhatsApp link, address and storefront address: what its posts say. */
  private async context(shopId: string): Promise<PostContext> {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    const phone = WhatsAppClient.normalisePhone(shop.whatsappNumber ?? '');
    return { shopName: shop.name, origin: storefrontOriginForShop(shop), whatsapp: phone ? `https://wa.me/${phone}` : '', location: (shop.address ?? '').trim() };
  }

  private async captionFor(shopId: string, channel: Channel, product: PostableProduct, now: Date) {
    const ctx = await this.context(shopId);
    const day = nairobiParts(now).day;
    return channel === 'FACEBOOK' ? buildCaption(product, ctx, day) : buildThreadsCaption(product, ctx, day);
  }

  /** What the next post would be on each channel, without posting it. */
  async preview(shopId: string, productId?: string) {
    const now = new Date();
    const settings = await this.getSettings(shopId);
    const out: Record<string, { product: { id: string; name: string; slug: string; imageUrl: string; brand: string | null } | null; caption: string | null }> = {};
    for (const channel of CHANNELS) {
      const product = await this.choose(shopId, channel, now, settings.cooldownDays, productId);
      out[channel] = product
        ? { product: { id: product.id, name: product.name, slug: product.slug, imageUrl: product.imageUrl, brand: product.brand }, caption: await this.captionFor(shopId, channel, product, now) }
        : { product: null, caption: null };
    }
    return { previews: out };
  }

  // --- posting ----------------------------------------------------------------------------------------------------------

  /** Posts for one slot. The slot key is unique per shop and channel, so the other backend slot (or a repeated check) cannot post it twice. */
  private async runSlot(shopId: string, channel: Channel, slotKey: string, scheduledFor: Date | null, triggeredBy: string, productId?: string) {
    let row;
    try {
      row = await this.prisma.socialPost.create({ data: { shopId, channel, slotKey, scheduledFor, triggeredBy, status: 'PENDING' } });
    } catch (error) {
      if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2002') return null;
      throw error;
    }
    return this.publish(row.id, productId);
  }

  private async publish(id: string, productId?: string) {
    const row = await this.prisma.socialPost.findUniqueOrThrow({ where: { id } });
    const channel = row.channel as Channel;
    const shopId = row.shopId;
    const now = new Date();
    const attempts = row.attempts + 1;

    let { productId: pid, productName, imageUrl, caption } = row;
    if (!pid || !caption || !imageUrl) {
      const settings = await this.getSettings(shopId);
      const product = await this.choose(shopId, channel, now, settings.cooldownDays, productId);
      if (!product) {
        return this.prisma.socialPost.update({ where: { id }, data: { status: 'SKIPPED', detail: productId ? 'That product cannot be posted now (not in stock, no photo or no price)' : 'No product in stock with a photo that has not been posted recently', attempts } });
      }
      pid = product.id; productName = product.name; imageUrl = product.imageUrl; caption = await this.captionFor(shopId, channel, product, now);
      await this.prisma.socialPost.update({ where: { id }, data: { productId: pid, productName, productSlug: product.slug, imageUrl, caption } });
    }

    const posted = await this.publishTo(shopId, channel, imageUrl!, caption!);
    if (posted.ok) {
      return this.prisma.socialPost.update({ where: { id }, data: { status: 'POSTED', externalId: posted.id, permalink: posted.permalink ?? null, postedAt: new Date(), attempts, detail: null } });
    }
    const retry = posted.transient && attempts < MAX_ATTEMPTS;
    if (!retry) this.logger.warn(`Shop ${shopId}: ${channel} post of ${productName} failed: ${posted.error}`);
    return this.prisma.socialPost.update({ where: { id }, data: { status: retry ? 'RETRY' : 'FAILED', detail: posted.error, attempts } });
  }

  /** The scheduled check, for every shop that has switched a channel on: posts any slot that is due, and tries again the posts that could not be taken. */
  async tick(now: Date = new Date()): Promise<{ posted: number; skipped: number; failed: number }> {
    const result = { posted: 0, skipped: 0, failed: 0 };
    if (!socialPostingAllowed()) return result;
    const tally = (r: { status: string } | null) => {
      if (!r) return;
      if (r.status === 'POSTED') result.posted += 1;
      else if (r.status === 'SKIPPED') result.skipped += 1;
      else if (r.status === 'FAILED') result.failed += 1;
    };

    const shops = await this.prisma.socialSetting.findMany({ where: { OR: [{ facebookEnabled: true }, { threadsEnabled: true }], shop: { status: { not: 'SUSPENDED' } } } });
    for (const row of shops) {
      try {
        const settings: SocialSettings = { facebookEnabled: row.facebookEnabled, threadsEnabled: row.threadsEnabled, times: cleanTimes(row.times), cooldownDays: row.cooldownDays, updatedBy: row.updatedBy };
        for (const channel of CHANNELS) {
          if (!this.enabled(settings, channel)) continue;
          if (!(await this.integrations.resolve(row.shopId, providerOf(channel)))) continue;
          if (channel === 'THREADS') await this.maintainThreadsLogin(row.shopId, now).catch((e) => this.logger.warn(`Shop ${row.shopId}: Threads login check failed: ${(e as Error).message}`));
          for (const slot of dueSlots(now, settings.times)) tally(await this.runSlot(row.shopId, channel, slot.slotKey, slot.scheduledFor, 'schedule'));
        }
      } catch (error) {
        // One shop's trouble never stops another's.
        this.logger.error(`Social posting for shop ${row.shopId} failed: ${(error as Error).message}`);
      }
    }

    // Retries: a post a channel could not take a few minutes ago, while its slot is still fresh.
    const due = await this.prisma.socialPost.findMany({
      where: {
        attempts: { lt: MAX_ATTEMPTS },
        createdAt: { gte: new Date(now.getTime() - 2 * 3_600_000) },
        OR: [
          { status: 'RETRY', updatedAt: { lt: new Date(now.getTime() - RETRY_AFTER_MS) } },
          { status: 'PENDING', updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
        ],
      },
      take: 25,
    });
    for (const post of due) {
      try {
        const settings = await this.getSettings(post.shopId);
        if (!this.enabled(settings, post.channel as Channel)) continue;
        const claimed = await this.prisma.socialPost.updateMany({ where: { id: post.id, status: post.status, updatedAt: post.updatedAt }, data: { status: 'PENDING' } });
        if (claimed.count === 1) tally(await this.publish(post.id));
      } catch (error) {
        this.logger.error(`Social retry for shop ${post.shopId} failed: ${(error as Error).message}`);
      }
    }
    if (result.posted || result.failed) this.logger.log(`Social posting: ${result.posted} posted, ${result.skipped} skipped, ${result.failed} failed.`);
    return result;
  }

  /** A post started by the owner, now, on one channel. Works whether or not the schedule is on. */
  async postNow(shopId: string, by: string, productId?: string, channel: Channel = 'FACEBOOK') {
    if (!socialPostingAllowed()) return { status: 'FAILED', detail: 'Posting is switched off on this server.' };
    if (!(await this.integrations.resolve(shopId, providerOf(channel)))) {
      return { status: 'FAILED', detail: `${channel === 'FACEBOOK' ? 'Facebook' : 'Threads'} is not connected for this shop. Connect it under Connections and switch it on.` };
    }
    return this.runSlot(shopId, channel, `manual@${Date.now()}`, null, by, productId);
  }

  /** Takes one of the shop's posts down from its channel. */
  async remove(shopId: string, id: string) {
    const row = await this.prisma.socialPost.findFirst({ where: { id, shopId } });
    if (!row || row.status !== 'POSTED' || !row.externalId) return { removed: false, detail: 'That post is not live' };
    const channel = row.channel as Channel;
    const conn = await this.integrations.resolve(shopId, providerOf(channel));
    if (!conn) return { removed: false, detail: `${channel === 'FACEBOOK' ? 'Facebook' : 'Threads'} is not connected for this shop` };
    const r = channel === 'FACEBOOK' ? await this.fb(conn.secrets.pageAccessToken, row.externalId, null, 'DELETE') : await this.th(row.externalId, conn.secrets.accessToken, 'DELETE');
    if (!r || r.status >= 300 || r.data?.success === false) {
      const why = this.failure(r).error;
      return { removed: false, detail: channel === 'THREADS' ? `${why}. Delete it in the Threads app instead, then it can be ignored here.` : why };
    }
    await this.prisma.socialPost.update({ where: { id }, data: { status: 'REMOVED', detail: 'Taken down' } });
    return { removed: true, detail: null };
  }

  // --- for the portal ---------------------------------------------------------------------------------------------------

  async status(shopId: string) {
    const now = new Date();
    const settings = await this.getSettings(shopId);
    const today = nairobiParts(now).day;
    const [counts, todays, fb, th, thRow] = await Promise.all([
      this.prisma.socialPost.groupBy({ by: ['channel', 'status'], where: { shopId }, _count: true }),
      this.prisma.socialPost.findMany({ where: { shopId, slotKey: { startsWith: today } }, select: { channel: true, slotKey: true, status: true } }),
      this.integrations.resolve(shopId, 'FACEBOOK'),
      this.integrations.resolve(shopId, 'THREADS'),
      this.prisma.shopIntegration.findUnique({ where: { shopId_provider: { shopId, provider: 'THREADS' } }, select: { lastError: true, tokenExpiresAt: true } }),
    ]);
    const tally = (channel: Channel, status: string) => counts.find((c) => c.channel === channel && c.status === status)?._count ?? 0;
    const channel = (c: Channel, connected: boolean) => ({
      connected,
      enabled: this.enabled(settings, c),
      nextPostAt: this.enabled(settings, c) && connected && socialPostingAllowed() ? nextSlot(now, settings.times) : null,
      posted: tally(c, 'POSTED'), failed: tally(c, 'FAILED'), skipped: tally(c, 'SKIPPED'), removed: tally(c, 'REMOVED'),
    });
    return {
      allowed: socialPostingAllowed(),
      times: settings.times,
      cooldownDays: settings.cooldownDays,
      updatedBy: settings.updatedBy,
      today: todays,
      facebook: channel('FACEBOOK', Boolean(fb)),
      threads: { ...channel('THREADS', Boolean(th)), tokenExpiresAt: thRow?.tokenExpiresAt ?? null, tokenError: thRow?.lastError ?? null },
    };
  }

  async list(shopId: string, query: { page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where = { shopId };
    const [items, total] = await Promise.all([
      this.prisma.socialPost.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.socialPost.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }
}
