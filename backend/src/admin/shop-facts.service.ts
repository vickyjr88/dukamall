import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { socialPostingAllowed } from '../social/social-posting.service';
import { ConnectionFacts, ShopFacts } from './shop-features';

const DAY_MS = 86_400_000;
const NONE: ConnectionFacts = { present: false, enabled: false, lastError: null, lastCheckedAt: null };

/**
 * Reads what each shop has set up and used, for many shops at once: one grouped query per table, never one per shop. It never selects a secret
 * (integration rows are read without their `secrets` column) -- only whether a connection exists, is on, and has a saved error.
 */
@Injectable()
export class ShopFactsService {
  constructor(private prisma: PrismaService) {}

  async forShops(shops: Array<{
    id: string; paystackSecretKey: string | null; paystackPublicKey: string | null; whatsappNumber: string | null; contactEmail: string | null; contactPhone: string | null;
    address: string | null; openingHours: string | null; tagline: string | null; ga4MeasurementId: string | null; searchConsoleVerification: string | null;
    metaPixelId: string | null; tiktokPixelId: string | null; xPixelId: string | null; customDomain: string | null; pendingDomain: string | null;
  }>, now = new Date()): Promise<Map<string, ShopFacts>> {
    const out = new Map<string, ShopFacts>();
    if (!shops.length) return out;
    const ids = shops.map((s) => s.id);
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const inShops = { in: ids };

    const [products, paid, integrations, settings, posts, sent, replies, shares, reports] = await Promise.all([
      this.prisma.$queryRaw<{ shopId: string; shown: number; shareable: number; noPhoto: number }[]>`
        SELECT s."shopId", count(*)::int AS shown, count(*) FILTER (WHERE s.stock > 0)::int AS shareable, count(*) FILTER (WHERE s.photos = 0)::int AS "noPhoto"
        FROM (
          SELECT p.id, p."shopId",
                 CASE WHEN jsonb_typeof(p."imageUrls") = 'array' THEN jsonb_array_length(p."imageUrls") ELSE 0 END AS photos,
                 coalesce(sum(greatest(v."stockOnHand", 0)) FILTER (WHERE v."isActive"), 0) AS stock
          FROM "Product" p LEFT JOIN "ProductVariant" v ON v."productId" = p.id
          WHERE p."isActive" = true AND p."shopId" = ANY(${ids})
          GROUP BY p.id
        ) s GROUP BY s."shopId"`,
      this.prisma.order.groupBy({ by: ['shopId'], where: { shopId: inShops, status: 'PAID' }, _count: { _all: true } }),
      this.prisma.shopIntegration.findMany({ where: { shopId: inShops }, select: { shopId: true, provider: true, enabled: true, config: true, lastCheckedAt: true, lastError: true } }),
      this.prisma.socialSetting.findMany({ where: { shopId: inShops }, select: { shopId: true, facebookEnabled: true, threadsEnabled: true } }),
      this.prisma.socialPost.groupBy({ by: ['shopId', 'channel', 'status'], where: { shopId: inShops, createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.whatsappOutreach.groupBy({ by: ['shopId'], where: { shopId: inShops, createdAt: { gte: since }, status: 'SENT' }, _count: { _all: true } }),
      this.prisma.facebookCommentReply.groupBy({ by: ['shopId'], where: { shopId: inShops, createdAt: { gte: since }, status: 'SENT' }, _count: { _all: true } }),
      this.prisma.shareEvent.groupBy({ by: ['shopId'], where: { shopId: inShops, createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.dailyReportSetting.findMany({ where: { shopId: inShops }, select: { shopId: true, enabled: true, emailRecipients: true, whatsappRecipients: true } }),
    ]);

    const productBy = new Map(products.map((r) => [r.shopId, r]));
    const paidBy = new Map(paid.map((r) => [r.shopId, r._count._all]));
    const settingBy = new Map(settings.map((r) => [r.shopId, r]));
    const sentBy = new Map(sent.map((r) => [r.shopId, r._count._all]));
    const repliesBy = new Map(replies.map((r) => [r.shopId, r._count._all]));
    const sharesBy = new Map(shares.map((r) => [r.shopId, r._count._all]));
    const reportBy = new Map(reports.map((r) => [r.shopId, r]));
    const tally = (shopId: string, channel: string, status: string) => posts.find((p) => p.shopId === shopId && p.channel === channel && p.status === status)?._count._all ?? 0;
    const allowed = socialPostingAllowed();

    for (const s of shops) {
      const rows = integrations.filter((i) => i.shopId === s.id);
      const conn = (provider: string) => {
        const row = rows.find((r) => r.provider === provider);
        return {
          fact: row ? { present: true, enabled: row.enabled, lastError: row.lastError, lastCheckedAt: row.lastCheckedAt } : NONE,
          config: ((row?.config ?? {}) as Record<string, unknown>),
        };
      };
      const wa = conn('WHATSAPP'); const fb = conn('FACEBOOK'); const th = conn('THREADS');
      const setting = settingBy.get(s.id);
      const product = productBy.get(s.id);
      const report = reportBy.get(s.id);
      const posted = (channel: string) => tally(s.id, channel, 'POSTED');
      const failed = (channel: string) => tally(s.id, channel, 'FAILED');
      // A shop is on the morning schedule only once its report settings have been saved with the report on (daily-report.service: `scheduled`).
      const recipients = report ? report.emailRecipients.length + report.whatsappRecipients.length : 0;

      out.set(s.id, {
        paystackReady: Boolean(s.paystackSecretKey && s.paystackPublicKey),
        paidOrders: paidBy.get(s.id) ?? 0,
        products: { shown: product?.shown ?? 0, shareable: product?.shareable ?? 0, noPhoto: product?.noPhoto ?? 0 },
        info: { whatsappNumber: Boolean(s.whatsappNumber), contact: Boolean(s.contactEmail || s.contactPhone), address: Boolean(s.address), hours: Boolean(s.openingHours), tagline: Boolean(s.tagline) },
        whatsapp: { ...wa.fact, sent30: sentBy.get(s.id) ?? 0, welcome: wa.config.autoSubscribe === 'true' },
        facebook: { ...fb.fact, replies30: repliesBy.get(s.id) ?? 0, commentReplies: fb.config.commentReplies === 'true' },
        threads: th.fact,
        posting: {
          facebookEnabled: Boolean(setting?.facebookEnabled), threadsEnabled: Boolean(setting?.threadsEnabled),
          posted30: posted('FACEBOOK') + posted('THREADS'), failed30: failed('FACEBOOK') + failed('THREADS'), serverAllows: allowed,
        },
        status: {
          prepared30: ['READY', 'POSTED'].reduce((n, st) => n + tally(s.id, 'STATUS', st), 0),
          posted30: posted('STATUS'),
        },
        shares30: sharesBy.get(s.id) ?? 0,
        dailyReport: { enabled: report?.enabled === true, recipients },
        tracking: { ga4: Boolean(s.ga4MeasurementId), searchConsole: Boolean(s.searchConsoleVerification), meta: Boolean(s.metaPixelId), tiktok: Boolean(s.tiktokPixelId), x: Boolean(s.xPixelId) },
        domain: { custom: Boolean(s.customDomain), pending: Boolean(s.pendingDomain) },
      });
    }
    return out;
  }
}
