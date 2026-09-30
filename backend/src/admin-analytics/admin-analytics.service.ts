import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type Granularity = 'day' | 'week' | 'month';

// Same window convention as PortalAnalyticsService (default to the last 30
// days when neither bound is given) -- one date-range picker on the admin
// Analytics page should drive every chart on it the same way.
function resolveWindow(from?: Date, to?: Date): { from: Date; to: Date } {
  const resolvedTo = to ?? new Date();
  const resolvedFrom = from ?? new Date(resolvedTo.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: resolvedFrom, to: resolvedTo };
}

const INACTIVITY_DAYS_FOR_CHURN = 30;

@Injectable()
export class AdminAnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Platform-wide paid revenue/orders bucketed by day/week/month --
   * replaces AdminService.revenueTrend's fixed "last N days, daily only"
   * shape (kept as-is there since the dashboard's small chart still calls
   * it) with a real date range and granularity, the same upgrade
   * PortalAnalyticsService.revenueTrend makes on the merchant side.
   */
  async revenueTrend(from?: Date, to?: Date, granularity: Granularity = 'day') {
    const window = resolveWindow(from, to);
    const rows = await this.prisma.$queryRaw<{ bucket: Date; revenue: string; orderCount: bigint }[]>`
      SELECT date_trunc(${granularity}, "createdAt") AS bucket,
             COALESCE(SUM("totalKes"), 0) AS revenue,
             COUNT(*) AS "orderCount"
      FROM "Order"
      WHERE status = 'PAID' AND "createdAt" >= ${window.from} AND "createdAt" <= ${window.to}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
    return rows.map((r) => ({
      date: r.bucket.toISOString().slice(0, 10),
      revenueKes: Number(r.revenue),
      orderCount: Number(r.orderCount),
    }));
  }

  /**
   * Every shop ranked by revenue over the window, with order count and a
   * naive growth figure (this window vs. the immediately preceding window
   * of equal length) -- "which shops are thriving vs. going quiet" as an
   * actual sortable table, not just the platform-wide total the dashboard
   * already showed. Shops with zero orders in the window still appear
   * (revenueKes: 0) so a shop going quiet is visible by its absence of
   * activity, not by disappearing from the list.
   */
  async shopLeaderboard(from?: Date, to?: Date) {
    const window = resolveWindow(from, to);
    const windowMs = window.to.getTime() - window.from.getTime();
    const priorFrom = new Date(window.from.getTime() - windowMs);
    const priorTo = window.from;

    const shops = await this.prisma.shop.findMany({ select: { id: true, name: true, slug: true, status: true } });

    const [currentAgg, priorAgg] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['shopId'],
        where: { status: 'PAID', createdAt: { gte: window.from, lte: window.to } },
        _sum: { totalKes: true },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['shopId'],
        where: { status: 'PAID', createdAt: { gte: priorFrom, lt: priorTo } },
        _sum: { totalKes: true },
      }),
    ]);

    return shops
      .map((shop) => {
        const current = currentAgg.find((a) => a.shopId === shop.id);
        const prior = priorAgg.find((a) => a.shopId === shop.id);
        const revenueKes = Number(current?._sum.totalKes ?? 0);
        const priorRevenueKes = Number(prior?._sum.totalKes ?? 0);
        // Growth is only meaningful when there was something to grow from;
        // a shop with zero revenue in the prior window but some this
        // window is "new activity," not a percentage (dividing by zero),
        // so that case is reported as null rather than a misleading +Infinity.
        const growthRate = priorRevenueKes > 0 ? (revenueKes - priorRevenueKes) / priorRevenueKes : null;
        return {
          shopId: shop.id,
          shopName: shop.name,
          shopSlug: shop.slug,
          status: shop.status,
          revenueKes,
          orderCount: current?._count._all ?? 0,
          growthRate,
        };
      })
      .sort((a, b) => b.revenueKes - a.revenueKes);
  }

  /**
   * Shop counts by status and by billing plan as of now, plus how many
   * shops made each status/plan transition during the window (read off
   * AdminAuditLog's own status_changed/billing_updated entries, the same
   * audit trail the shop detail page already renders) -- turns "5 shops
   * are TRIAL" into "5 are TRIAL, and 2 moved TRIAL -> ACTIVE this month,"
   * the actual conversion-funnel number a platform operator needs.
   */
  async lifecycleFunnel(from?: Date, to?: Date) {
    const window = resolveWindow(from, to);

    const [statusCounts, planCounts, statusChanges, billingChanges] = await Promise.all([
      this.prisma.shop.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.shop.groupBy({ by: ['billingPlan'], _count: { _all: true } }),
      this.prisma.adminAuditLog.findMany({
        where: { action: 'shop.status_changed', createdAt: { gte: window.from, lte: window.to } },
        select: { metadata: true },
      }),
      this.prisma.adminAuditLog.findMany({
        where: { action: 'billing.updated', createdAt: { gte: window.from, lte: window.to } },
        select: { metadata: true },
      }),
    ]);

    const transitionCounts = new Map<string, number>();
    for (const entry of statusChanges) {
      const meta = entry.metadata as { from?: string; to?: string } | null;
      if (!meta?.from || !meta?.to) continue;
      const key = `${meta.from}->${meta.to}`;
      transitionCounts.set(key, (transitionCounts.get(key) ?? 0) + 1);
    }

    let trialToPaidCount = 0;
    for (const entry of billingChanges) {
      const meta = entry.metadata as { billingPlan?: { from?: string; to?: string } } | null;
      const planChange = meta?.billingPlan;
      if (planChange?.from === 'TRIAL' && (planChange?.to === 'BASIC' || planChange?.to === 'PRO')) trialToPaidCount++;
    }

    return {
      byStatus: statusCounts.map((s) => ({ status: s.status, count: s._count._all })),
      byBillingPlan: planCounts.map((p) => ({ billingPlan: p.billingPlan, count: p._count._all })),
      statusTransitions: Array.from(transitionCounts.entries()).map(([key, count]) => {
        const [from2, to2] = key.split('->');
        return { from: from2, to: to2, count };
      }),
      trialToPaidCount,
    };
  }

  /**
   * Shops created during the window, versus shops that have gone quiet --
   * defined as having had at least one paid order ever, but none in the
   * last INACTIVITY_DAYS_FOR_CHURN days as of the window's end. This is an
   * early-warning signal (who's slipping) rather than a lifetime count, so
   * it deliberately does NOT count a shop that simply never had an order
   * as "churned" -- that's a shop that never activated, a different
   * problem lifecycleFunnel's TRIAL bucket already surfaces.
   */
  async newAndChurnedShops(from?: Date, to?: Date) {
    const window = resolveWindow(from, to);
    const churnCutoff = new Date(window.to.getTime() - INACTIVITY_DAYS_FOR_CHURN * 24 * 60 * 60 * 1000);

    const [newShops, everPaidShopIds, recentlyPaidShopIds] = await Promise.all([
      this.prisma.shop.findMany({
        where: { createdAt: { gte: window.from, lte: window.to } },
        select: { id: true, name: true, slug: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.findMany({ where: { status: 'PAID' }, select: { shopId: true }, distinct: ['shopId'] }),
      this.prisma.order.findMany({
        where: { status: 'PAID', createdAt: { gte: churnCutoff } },
        select: { shopId: true },
        distinct: ['shopId'],
      }),
    ]);

    const recentlyPaidSet = new Set(recentlyPaidShopIds.map((o) => o.shopId));
    const churnedShopIds = everPaidShopIds.map((o) => o.shopId).filter((id) => !recentlyPaidSet.has(id));
    const churnedShops = churnedShopIds.length
      ? await this.prisma.shop.findMany({
          where: { id: { in: churnedShopIds } },
          select: { id: true, name: true, slug: true },
        })
      : [];

    return {
      newShops: newShops.map((s) => ({ id: s.id, name: s.name, slug: s.slug, createdAt: s.createdAt })),
      newShopCount: newShops.length,
      churnedShops,
      churnedShopCount: churnedShops.length,
      inactivityThresholdDays: INACTIVITY_DAYS_FOR_CHURN,
    };
  }
}
