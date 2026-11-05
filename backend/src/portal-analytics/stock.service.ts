import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { lineMoney } from './money.service';

const DAY_MS = 24 * 3600_000;
const num = (v: unknown) => Number(v ?? 0);

/**
 * Where the stock is tied up and where demand is going unserved, in four lists the owner can act on:
 *  - dead stock: in stock, not sold for a long time (money sitting on a shelf)
 *  - running low: selling steadily and nearly gone (reorder before it sells out)
 *  - missed demand: sold out, yet people are still looking at it or asking on WhatsApp
 *  - what makes money: profit by product, where the cost is known
 */
@Injectable()
export class StockService {
  constructor(private prisma: PrismaService) {}

  async stock(shopId: string, from: Date, to: Date, deadDays = 60) {
    const now = new Date();
    const windowDays = Math.max(1, (to.getTime() - from.getTime()) / DAY_MS);

    const [products, lines, lastSold, events] = await Promise.all([
      this.prisma.product.findMany({
        where: { shopId },
        select: {
          id: true, name: true, slug: true, isActive: true, costKes: true, createdAt: true,
          variants: { where: { isActive: true }, select: { stockOnHand: true, priceKes: true } },
        },
      }),
      this.prisma.orderLine.findMany({
        where: { order: { shopId, status: { not: 'CANCELLED' }, createdAt: { gte: from, lte: to } } },
        select: { quantity: true, priceKes: true, unitCostKes: true, variant: { select: { productId: true, product: { select: { costKes: true } } } } },
      }),
      this.prisma.$queryRaw<Array<{ productId: string; lastSold: Date }>>(Prisma.sql`
        SELECT v."productId" AS "productId", max(o."createdAt") AS "lastSold"
        FROM "OrderLine" l JOIN "Order" o ON o.id = l."orderId" JOIN "ProductVariant" v ON v.id = l."variantId"
        WHERE o."shopId" = ${shopId} AND o.status <> 'CANCELLED'
        GROUP BY v."productId"
      `),
      this.prisma.$queryRaw<Array<{ slug: string; views: number; carts: number; whatsapp: number }>>(Prisma.sql`
        SELECT "productSlug" AS slug,
          count(DISTINCT "sessionId") FILTER (WHERE type = 'VIEW_PRODUCT')::int AS views,
          count(DISTINCT "sessionId") FILTER (WHERE type = 'ADD_TO_CART')::int AS carts,
          count(DISTINCT "sessionId") FILTER (WHERE type = 'WHATSAPP_CLICK')::int AS whatsapp
        FROM "StorefrontEvent"
        WHERE "shopId" = ${shopId} AND "productSlug" IS NOT NULL
          AND "createdAt" BETWEEN (${from}::timestamptz AT TIME ZONE 'UTC') AND (${to}::timestamptz AT TIME ZONE 'UTC')
        GROUP BY "productSlug"
      `),
    ]);

    const lastSoldBy = new Map(lastSold.map((r) => [r.productId, r.lastSold]));
    const eventsBy = new Map(events.map((e) => [e.slug, e]));
    const soldBy = new Map<string, { units: number; revenue: number; costedRevenue: number; cost: number }>();
    for (const line of lines) {
      const id = line.variant.productId;
      const m = lineMoney(line);
      const row = soldBy.get(id) ?? { units: 0, revenue: 0, costedRevenue: 0, cost: 0 };
      row.units += line.quantity; row.revenue += m.revenue;
      if (m.cost !== null) { row.costedRevenue += m.revenue; row.cost += m.cost; }
      soldBy.set(id, row);
    }

    // Only what can be bought today: an inactive product's stock is not on the shelf.
    const live = products.filter((p) => p.isActive);
    const withStock = live.map((p) => ({ p, units: p.variants.reduce((s, v) => s + v.stockOnHand, 0) }));

    let units = 0, retail = 0, atCost = 0, withoutCost = 0;
    for (const { p, units: u } of withStock) {
      units += u;
      retail += p.variants.reduce((s, v) => s + v.stockOnHand * num(v.priceKes), 0);
      if (u > 0) {
        if (p.costKes === null) withoutCost++; else atCost += u * num(p.costKes);
      }
    }

    const tiedUp = (p: (typeof products)[number], u: number) =>
      p.costKes !== null
        ? { valueKes: u * num(p.costKes), basis: 'cost' as const }
        : { valueKes: p.variants.reduce((s, v) => s + v.stockOnHand * num(v.priceKes), 0), basis: 'price' as const };

    const dead = withStock
      .filter(({ p, units: u }) => {
        if (u <= 0) return false;
        const last = lastSoldBy.get(p.id);
        const since = last ?? p.createdAt;
        return now.getTime() - since.getTime() > deadDays * DAY_MS;
      })
      .map(({ p, units: u }) => {
        const last = lastSoldBy.get(p.id);
        return { slug: p.slug, name: p.name, units: u, ...tiedUp(p, u), daysSinceSale: last ? Math.floor((now.getTime() - last.getTime()) / DAY_MS) : null, onShelfDays: Math.floor((now.getTime() - p.createdAt.getTime()) / DAY_MS) };
      })
      .sort((a, b) => b.valueKes - a.valueKes);

    const low = withStock
      .map(({ p, units: u }) => {
        const sold = soldBy.get(p.id)?.units ?? 0;
        const perDay = sold / windowDays;
        return { slug: p.slug, name: p.name, units: u, soldInPeriod: sold, coverDays: perDay > 0 ? Math.round(u / perDay) : null };
      })
      .filter((r) => r.soldInPeriod >= 3 && r.units > 0 && r.coverDays !== null && r.coverDays <= 14)
      .sort((a, b) => (a.coverDays ?? 0) - (b.coverDays ?? 0));

    const missed = withStock
      .filter(({ units: u }) => u <= 0)
      .map(({ p }) => {
        const e = eventsBy.get(p.slug);
        return { slug: p.slug, name: p.name, views: e?.views ?? 0, carts: e?.carts ?? 0, whatsapp: e?.whatsapp ?? 0 };
      })
      .filter((r) => r.views + r.carts + r.whatsapp > 0)
      .sort((a, b) => b.whatsapp + b.carts - (a.whatsapp + a.carts) || b.views - a.views);

    const earners = products
      .filter((p) => soldBy.has(p.id))
      .map((p) => {
        const s = soldBy.get(p.id)!;
        return {
          slug: p.slug, name: p.name, unitsSold: s.units, revenueKes: s.revenue,
          profitKes: s.costedRevenue > 0 ? s.costedRevenue - s.cost : null,
          marginRate: s.costedRevenue > 0 ? (s.costedRevenue - s.cost) / s.costedRevenue : null,
        };
      })
      // Products whose profit is known come first, biggest earner on top; the rest follow by what they brought in.
      .sort((a, b) => Number(b.profitKes !== null) - Number(a.profitKes !== null) || (b.profitKes ?? 0) - (a.profitKes ?? 0) || b.revenueKes - a.revenueKes);

    return {
      deadDays,
      onHand: { units, retailValueKes: retail, costValueKes: atCost, productsWithoutCost: withoutCost },
      deadStock: { count: dead.length, tiedUpKes: dead.reduce((s, d) => s + d.valueKes, 0), items: dead.slice(0, 15) },
      runningLow: low.slice(0, 10),
      missedDemand: missed.slice(0, 10),
      earners: earners.slice(0, 10),
    };
  }
}
