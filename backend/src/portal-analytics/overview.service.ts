import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Bucket, change, fillHours, fillWeekdays, pickBucket, previousWindow, SHOP_TZ, zeroFill } from './overview';

const LOCAL_CREATED = `("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE '${SHOP_TZ}'`;
/** Dashboard and attention lists use the same number the Products screen does for "running low". */
const LOW_STOCK = 3;

type Totals = { orders: number; soldKes: number; paidKes: number; cancelled: number; units: number; visits: number; whatsappTaps: number };

@Injectable()
export class OverviewService {
  constructor(private prisma: PrismaService) {}

  private async totals(shopId: string, from: Date, to: Date): Promise<Totals> {
    const [orders, units, events] = await Promise.all([
      this.prisma.$queryRaw<{ orders: number; sold: string; paid: string; cancelled: number }[]>`
        SELECT count(*) FILTER (WHERE status <> 'CANCELLED')::int AS orders,
               coalesce(sum("totalKes") FILTER (WHERE status <> 'CANCELLED'), 0) AS sold,
               coalesce(sum("totalKes") FILTER (WHERE status = 'PAID'), 0) AS paid,
               count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled
        FROM "Order" WHERE "shopId" = ${shopId} AND "createdAt" >= ${from} AND "createdAt" <= ${to}`,
      this.prisma.$queryRaw<{ units: number }[]>`
        SELECT coalesce(sum(l.quantity), 0)::int AS units
        FROM "OrderLine" l JOIN "Order" o ON o.id = l."orderId"
        WHERE o."shopId" = ${shopId} AND o.status <> 'CANCELLED' AND o."createdAt" >= ${from} AND o."createdAt" <= ${to}`,
      this.prisma.$queryRaw<{ visits: number; taps: number }[]>`
        SELECT count(DISTINCT "sessionId") FILTER (WHERE type = 'SESSION_START')::int AS visits,
               count(*) FILTER (WHERE type = 'WHATSAPP_CLICK')::int AS taps
        FROM "StorefrontEvent" WHERE "shopId" = ${shopId} AND "createdAt" >= ${from} AND "createdAt" <= ${to}`,
    ]);
    const o = orders[0];
    return {
      orders: o?.orders ?? 0, soldKes: Number(o?.sold ?? 0), paidKes: Number(o?.paid ?? 0), cancelled: o?.cancelled ?? 0,
      units: units[0]?.units ?? 0, visits: events[0]?.visits ?? 0, whatsappTaps: events[0]?.taps ?? 0,
    };
  }

  /** One read for the whole overview: this period, the period before it, and what moved. */
  async overview(shopId: string, from: Date, to: Date, bucket?: Bucket) {
    const unit = bucket ?? pickBucket(from, to);
    const prev = previousWindow(from, to);

    const [current, previous, orderRows, visitRows, byStatus, bySource, byWeekday, byHour, top, views] = await Promise.all([
      this.totals(shopId, from, to),
      this.totals(shopId, prev.from, prev.to),
      this.prisma.$queryRaw<{ date: string; orders: number; sold: string; paid: string }[]>`
        SELECT to_char(date_trunc(${unit}, ${this.local()}), 'YYYY-MM-DD') AS date,
               count(*)::int AS orders, sum("totalKes") AS sold, coalesce(sum("totalKes") FILTER (WHERE status = 'PAID'), 0) AS paid
        FROM "Order" WHERE "shopId" = ${shopId} AND status <> 'CANCELLED' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ date: string; visits: number }[]>`
        SELECT to_char(date_trunc(${unit}, ${this.local()}), 'YYYY-MM-DD') AS date, count(DISTINCT "sessionId")::int AS visits
        FROM "StorefrontEvent" WHERE "shopId" = ${shopId} AND type = 'SESSION_START' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ status: string; orders: number; amount: string }[]>`
        SELECT status::text AS status, count(*)::int AS orders, coalesce(sum("totalKes"), 0) AS amount
        FROM "Order" WHERE "shopId" = ${shopId} AND "createdAt" >= ${from} AND "createdAt" <= ${to} GROUP BY 1`,
      this.prisma.$queryRaw<{ source: string; orders: number; sold: string }[]>`
        SELECT source::text AS source, count(*)::int AS orders, coalesce(sum("totalKes"), 0) AS sold
        FROM "Order" WHERE "shopId" = ${shopId} AND status <> 'CANCELLED' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY 1 ORDER BY 3 DESC`,
      this.prisma.$queryRaw<{ dow: number; orders: number; sold: string }[]>`
        SELECT extract(dow FROM ${this.local()})::int AS dow, count(*)::int AS orders, coalesce(sum("totalKes"), 0) AS sold
        FROM "Order" WHERE "shopId" = ${shopId} AND status <> 'CANCELLED' AND "createdAt" >= ${from} AND "createdAt" <= ${to} GROUP BY 1`,
      this.prisma.$queryRaw<{ hour: number; orders: number }[]>`
        SELECT extract(hour FROM ${this.local()})::int AS hour, count(*)::int AS orders
        FROM "Order" WHERE "shopId" = ${shopId} AND status <> 'CANCELLED' AND "createdAt" >= ${from} AND "createdAt" <= ${to} GROUP BY 1`,
      this.prisma.$queryRaw<{ id: string; name: string; slug: string; image: string | null; units: number; revenue: string }[]>`
        SELECT p.id, p.name, p.slug, p."imageUrls" ->> 0 AS image, sum(l.quantity)::int AS units, sum(l.quantity * l."priceKes") AS revenue
        FROM "OrderLine" l
        JOIN "Order" o ON o.id = l."orderId"
        JOIN "ProductVariant" v ON v.id = l."variantId"
        JOIN "Product" p ON p.id = v."productId"
        WHERE o."shopId" = ${shopId} AND o.status <> 'CANCELLED' AND o."createdAt" >= ${from} AND o."createdAt" <= ${to}
        GROUP BY p.id ORDER BY revenue DESC LIMIT 8`,
      this.prisma.$queryRaw<{ slug: string; n: number }[]>`
        SELECT "productSlug" AS slug, count(*)::int AS n FROM "StorefrontEvent"
        WHERE "shopId" = ${shopId} AND type = 'VIEW_PRODUCT' AND "productSlug" IS NOT NULL AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY 1`,
    ]);

    const visitsByDay = new Map(visitRows.map((r) => [r.date, r.visits]));
    const merged = zeroFill(
      orderRows.map((r) => ({ date: r.date, orders: r.orders, soldKes: Number(r.sold), paidKes: Number(r.paid), visits: visitsByDay.get(r.date) ?? 0 })),
      from, to, unit, { orders: 0, soldKes: 0, paidKes: 0, visits: 0 },
    ).map((row) => ({ ...row, visits: visitsByDay.get(row.date) ?? row.visits }));

    const viewsBySlug = new Map(views.map((v) => [v.slug, v.n]));
    const conversion = (t: Totals) => (t.visits > 0 ? t.orders / t.visits : null);

    return {
      range: { from, to, bucket: unit },
      current: { ...current, averageOrderKes: current.orders ? current.soldKes / current.orders : 0, conversion: conversion(current) },
      previous: { ...previous, averageOrderKes: previous.orders ? previous.soldKes / previous.orders : 0, conversion: conversion(previous) },
      // How much each number moved against the period before; null where there was nothing to compare with.
      change: {
        soldKes: change(current.soldKes, previous.soldKes),
        paidKes: change(current.paidKes, previous.paidKes),
        orders: change(current.orders, previous.orders),
        units: change(current.units, previous.units),
        visits: change(current.visits, previous.visits),
        averageOrderKes: change(current.orders ? current.soldKes / current.orders : 0, previous.orders ? previous.soldKes / previous.orders : 0),
        whatsappTaps: change(current.whatsappTaps, previous.whatsappTaps),
      },
      series: merged,
      byStatus: byStatus.map((r) => ({ status: r.status, orders: r.orders, amountKes: Number(r.amount) })),
      bySource: bySource.map((r) => ({ source: r.source, orders: r.orders, soldKes: Number(r.sold) })),
      byWeekday: fillWeekdays(byWeekday.map((r) => ({ dow: r.dow, orders: r.orders, soldKes: Number(r.sold) }))),
      byHour: fillHours(byHour),
      topProducts: top.map((r) => ({ id: r.id, name: r.name, slug: r.slug, imageUrl: r.image, units: r.units, revenueKes: Number(r.revenue), views: viewsBySlug.get(r.slug) ?? 0 })),
    };
  }

  private local() {
    // Prisma's DateTime is stored as a UTC timestamp without a zone: say so, then move it to Nairobi.
    return Prisma.raw(LOCAL_CREATED);
  }

  /**
   * What needs a person today, for the Dashboard -- open to staff as well as the owner, since it is the day's work and
   * carries no takings. Each number is one click from the list that fixes it.
   */
  async attention(shopId: string) {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const [unpaid, toShip, newLeads, products] = await Promise.all([
      this.prisma.order.aggregate({ where: { shopId, status: 'PENDING', createdAt: { lt: cutoff } }, _count: { _all: true }, _sum: { totalKes: true } }),
      this.prisma.order.count({ where: { shopId, status: { not: 'CANCELLED' }, fulfilmentStatus: 'UNFULFILLED' } }),
      this.prisma.cartLead.count({ where: { shopId, status: 'NEW' } }),
      this.prisma.$queryRaw<{ id: string; name: string; slug: string; image: string | null; photos: number; stock: number }[]>`
        SELECT p.id, p.name, p.slug, p."imageUrls" ->> 0 AS image,
               CASE WHEN jsonb_typeof(p."imageUrls") = 'array' THEN jsonb_array_length(p."imageUrls") ELSE 0 END AS photos,
               coalesce(sum(greatest(v."stockOnHand", 0)) FILTER (WHERE v."isActive"), 0)::int AS stock
        FROM "Product" p LEFT JOIN "ProductVariant" v ON v."productId" = p.id
        WHERE p."shopId" = ${shopId} AND p."isActive" = true
        GROUP BY p.id`,
    ]);
    const lowList = products.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK).sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
    return {
      unpaidOver2Days: { orders: unpaid._count._all, amountKes: Number(unpaid._sum.totalKes ?? 0) },
      toShip,
      newLeads,
      soldOut: products.filter((p) => p.stock === 0).length,
      lowStock: lowList.length,
      noPhoto: products.filter((p) => p.photos === 0).length,
      lowStockProducts: lowList.slice(0, 8).map((p) => ({ id: p.id, name: p.name, imageUrl: p.image, stock: p.stock })),
    };
  }
}
