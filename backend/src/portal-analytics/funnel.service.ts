import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type FunnelRow = {
  sessions: number;
  viewedProduct: number;
  addedToCart: number;
  beganCheckout: number;
  tappedWhatsapp: number;
  /** Sessions that went on to a WhatsApp order message (the order form's own button, which records a lead). */
  whatsappOrders: number;
  orders: number;
  revenueKes: number;
};

const num = (v: unknown) => Number(v ?? 0);

/**
 * A date as the UTC timestamp the columns hold. Without the cast, Postgres reads a bound date in the database session's
 * own time zone, which shifts the window by hours on any server not set to UTC.
 */
const utc = (d: Date) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`;

/**
 * What happened to the visits that began in a period: how many looked at a product, added to cart, began checkout, tapped
 * WhatsApp and ordered, and the same by where the visit came from. A visit is followed to the end, so an order placed
 * tomorrow by someone who arrived today still counts for today's visit.
 *
 * An order is linked to its visit two ways: its own session id (an online checkout), or the WhatsApp lead it was made from
 * (a shop that sells over WhatsApp turns the lead into the order by hand, and the lead remembers the visit).
 */
@Injectable()
export class FunnelService {
  constructor(private prisma: PrismaService) {}

  async funnel(shopId: string, from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      WITH s AS (
        SELECT DISTINCT ON ("sessionId") "sessionId", source, medium, campaign, device, "createdAt"
        FROM "StorefrontEvent"
        WHERE "shopId" = ${shopId} AND type = 'SESSION_START' AND "createdAt" BETWEEN ${utc(from)} AND ${utc(to)}
        ORDER BY "sessionId", "createdAt"
      ), f AS (
        SELECT e."sessionId",
          bool_or(e.type = 'VIEW_PRODUCT') AS viewed,
          bool_or(e.type = 'ADD_TO_CART') AS added,
          bool_or(e.type = 'BEGIN_CHECKOUT') AS checkout,
          bool_or(e.type = 'WHATSAPP_CLICK') AS whatsapp
        FROM "StorefrontEvent" e JOIN s ON s."sessionId" = e."sessionId"
        WHERE e."shopId" = ${shopId}
        GROUP BY e."sessionId"
      ), o AS (
        SELECT COALESCE(ord."sessionId", l."sessionId") AS "sessionId", count(DISTINCT ord.id) AS orders, sum(ord."totalKes") AS revenue
        FROM "Order" ord
        LEFT JOIN "CartLead" l ON l."convertedOrderId" = ord.id AND l."shopId" = ord."shopId"
        WHERE ord."shopId" = ${shopId} AND ord.status <> 'CANCELLED' AND COALESCE(ord."sessionId", l."sessionId") IS NOT NULL
        GROUP BY COALESCE(ord."sessionId", l."sessionId")
      ), w AS (
        SELECT DISTINCT "sessionId" FROM "CartLead"
        WHERE "shopId" = ${shopId} AND source = 'WHATSAPP_ORDER' AND "sessionId" IS NOT NULL
      )
      SELECT s.source, s.medium, s.device,
        count(*)::int AS sessions,
        count(*) FILTER (WHERE f.viewed)::int AS "viewedProduct",
        count(*) FILTER (WHERE f.added)::int AS "addedToCart",
        count(*) FILTER (WHERE f.checkout)::int AS "beganCheckout",
        count(*) FILTER (WHERE f.whatsapp)::int AS "tappedWhatsapp",
        count(*) FILTER (WHERE w."sessionId" IS NOT NULL)::int AS "whatsappOrders",
        COALESCE(sum(o.orders), 0)::int AS orders,
        COALESCE(sum(o.revenue), 0)::float AS "revenueKes"
      FROM s
      LEFT JOIN f ON f."sessionId" = s."sessionId"
      LEFT JOIN o ON o."sessionId" = s."sessionId"
      LEFT JOIN w ON w."sessionId" = s."sessionId"
      GROUP BY s.source, s.medium, s.device
    `);

    const blank = (): FunnelRow => ({ sessions: 0, viewedProduct: 0, addedToCart: 0, beganCheckout: 0, tappedWhatsapp: 0, whatsappOrders: 0, orders: 0, revenueKes: 0 });
    const add = (target: FunnelRow, r: Record<string, unknown>) => {
      target.sessions += num(r.sessions); target.viewedProduct += num(r.viewedProduct); target.addedToCart += num(r.addedToCart);
      target.beganCheckout += num(r.beganCheckout); target.tappedWhatsapp += num(r.tappedWhatsapp); target.whatsappOrders += num(r.whatsappOrders);
      target.orders += num(r.orders); target.revenueKes += num(r.revenueKes);
    };

    const totals = blank();
    const bySource = new Map<string, FunnelRow & { source: string; medium: string }>();
    const byDevice = new Map<string, FunnelRow & { device: string }>();
    for (const r of rows) {
      add(totals, r);
      const key = `${r.source}|${r.medium}`;
      const s = bySource.get(key) ?? { ...blank(), source: String(r.source), medium: String(r.medium) };
      add(s, r); bySource.set(key, s);
      const d = byDevice.get(String(r.device)) ?? { ...blank(), device: String(r.device ?? 'unknown') };
      add(d, r); byDevice.set(String(r.device), d);
    }

    const [orderTotal, daily, products, searches] = await Promise.all([
      this.prisma.order.aggregate({
        where: { shopId, status: { not: 'CANCELLED' }, createdAt: { gte: from, lte: to } },
        _count: { _all: true }, _sum: { totalKes: true },
      }),
      this.prisma.$queryRaw<Array<{ day: Date; sessions: number; productViews: number }>>(Prisma.sql`
        SELECT date_trunc('day', "createdAt") AS day,
          count(DISTINCT "sessionId") FILTER (WHERE type = 'SESSION_START')::int AS sessions,
          count(*) FILTER (WHERE type = 'VIEW_PRODUCT')::int AS "productViews"
        FROM "StorefrontEvent" WHERE "shopId" = ${shopId} AND "createdAt" BETWEEN ${utc(from)} AND ${utc(to)}
        GROUP BY 1 ORDER BY 1
      `),
      this.prisma.$queryRaw<Array<{ slug: string; views: number; carts: number; whatsapp: number }>>(Prisma.sql`
        SELECT "productSlug" AS slug,
          count(DISTINCT "sessionId") FILTER (WHERE type = 'VIEW_PRODUCT')::int AS views,
          count(DISTINCT "sessionId") FILTER (WHERE type = 'ADD_TO_CART')::int AS carts,
          count(DISTINCT "sessionId") FILTER (WHERE type = 'WHATSAPP_CLICK')::int AS whatsapp
        FROM "StorefrontEvent"
        WHERE "shopId" = ${shopId} AND "productSlug" IS NOT NULL AND "createdAt" BETWEEN ${utc(from)} AND ${utc(to)}
        GROUP BY "productSlug" ORDER BY views DESC, carts DESC LIMIT 25
      `),
      this.prisma.$queryRaw<Array<{ term: string; searches: number }>>(Prisma.sql`
        SELECT lower(detail) AS term, count(*)::int AS searches
        FROM "StorefrontEvent"
        WHERE "shopId" = ${shopId} AND type = 'SEARCH' AND detail IS NOT NULL AND "createdAt" BETWEEN ${utc(from)} AND ${utc(to)}
        GROUP BY 1 ORDER BY searches DESC LIMIT 10
      `),
    ]);

    // Names and units sold for the products people looked at.
    const slugs = products.map((p) => p.slug);
    const found = slugs.length
      ? await this.prisma.product.findMany({
          where: { shopId, slug: { in: slugs } },
          select: { id: true, slug: true, name: true, variants: { select: { stockOnHand: true, isActive: true } } },
        })
      : [];
    const sold = found.length
      ? await this.prisma.orderLine.groupBy({
          by: ['variantId'],
          where: { order: { shopId, status: { not: 'CANCELLED' }, createdAt: { gte: from, lte: to } }, variant: { productId: { in: found.map((p) => p.id) } } },
          _sum: { quantity: true },
        })
      : [];
    const variantProduct = sold.length
      ? await this.prisma.productVariant.findMany({ where: { id: { in: sold.map((s) => s.variantId) } }, select: { id: true, productId: true } })
      : [];
    const unitsByProduct = new Map<string, number>();
    for (const row of sold) {
      const productId = variantProduct.find((v) => v.id === row.variantId)?.productId;
      if (productId) unitsByProduct.set(productId, (unitsByProduct.get(productId) ?? 0) + (row._sum.quantity ?? 0));
    }

    const attributedOrders = totals.orders;
    return {
      from, to, totals,
      bySource: Array.from(bySource.values()).sort((a, b) => b.sessions - a.sessions),
      byDevice: Array.from(byDevice.values()).sort((a, b) => b.sessions - a.sessions),
      daily: daily.map((d) => ({ date: d.day.toISOString().slice(0, 10), sessions: d.sessions, productViews: d.productViews })),
      products: products.map((p) => {
        const product = found.find((f) => f.slug === p.slug);
        return {
          slug: p.slug, name: product?.name ?? p.slug, views: p.views, addedToCart: p.carts, tappedWhatsapp: p.whatsapp,
          unitsSold: product ? unitsByProduct.get(product.id) ?? 0 : 0,
          inStock: product ? product.variants.some((v) => v.isActive && v.stockOnHand > 0) : null,
        };
      }),
      searches: searches.map((s) => ({ term: s.term, searches: s.searches })),
      /** Orders placed in the period, and how many of them could be linked to a visit that started in it. */
      orders: { placed: orderTotal._count._all, placedKes: Number(orderTotal._sum.totalKes ?? 0), linkedToVisits: attributedOrders },
    };
  }
}
