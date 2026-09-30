import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type Granularity = 'day' | 'week' | 'month';

// One shared window helper -- every method here takes the same
// {from, to} shape (defaulting to the last 30 days when neither is given),
// so a merchant's date-range picker on the Analytics page drives every
// chart on it consistently rather than each metric having its own default.
function resolveWindow(from?: Date, to?: Date): { from: Date; to: Date } {
  const resolvedTo = to ?? new Date();
  const resolvedFrom = from ?? new Date(resolvedTo.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: resolvedFrom, to: resolvedTo };
}

// date_trunc's own bucket names line up 1:1 with Granularity, so this is
// just a pass-through -- kept as a named function (not inlined into the
// SQL template) so a future 'quarter'/'year' addition has one place to
// extend rather than three raw-SQL call sites drifting apart.
function truncUnit(granularity: Granularity): string {
  return granularity;
}

@Injectable()
export class PortalAnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Paid revenue and order count bucketed by day/week/month over a custom
   * range -- the dashboard's existing salesSummary (ReportsService) only
   * ever gives one lifetime total for a window, with no time series to
   * chart. This is the merchant Analytics page's main chart.
   */
  async revenueTrend(shopId: string, from?: Date, to?: Date, granularity: Granularity = 'day') {
    const window = resolveWindow(from, to);
    const unit = truncUnit(granularity);
    const rows = await this.prisma.$queryRaw<{ bucket: Date; revenue: string; orderCount: bigint }[]>`
      SELECT date_trunc(${unit}, "createdAt") AS bucket,
             COALESCE(SUM("totalKes"), 0) AS revenue,
             COUNT(*) AS "orderCount"
      FROM "Order"
      WHERE "shopId" = ${shopId} AND status = 'PAID'
        AND "createdAt" >= ${window.from} AND "createdAt" <= ${window.to}
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
   * Revenue and units sold grouped by category and by brand over the same
   * window -- "which parts of my catalogue actually sell," which the
   * dashboard's top-10-variants list can only hint at one SKU at a time.
   * Two separate group-bys (not one query with both dimensions) since a
   * product can have a category with no brand or vice versa, and mixing
   * them into one crosstab would need a UI this batch doesn't build.
   */
  async salesByCategoryAndBrand(shopId: string, from?: Date, to?: Date) {
    const window = resolveWindow(from, to);
    const paidLines = await this.prisma.orderLine.findMany({
      where: {
        order: { shopId, status: 'PAID', createdAt: { gte: window.from, lte: window.to } },
      },
      select: {
        quantity: true,
        priceKes: true,
        variant: { select: { product: { select: { brand: true, category: { select: { name: true } } } } } },
      },
    });

    const byCategory = new Map<string, { revenueKes: number; unitsSold: number }>();
    const byBrand = new Map<string, { revenueKes: number; unitsSold: number }>();

    for (const line of paidLines) {
      const revenue = Number(line.priceKes) * line.quantity;
      const categoryName = line.variant.product.category?.name ?? 'Uncategorized';
      const brandName = line.variant.product.brand ?? 'Unbranded';

      const cat = byCategory.get(categoryName) ?? { revenueKes: 0, unitsSold: 0 };
      cat.revenueKes += revenue;
      cat.unitsSold += line.quantity;
      byCategory.set(categoryName, cat);

      const brand = byBrand.get(brandName) ?? { revenueKes: 0, unitsSold: 0 };
      brand.revenueKes += revenue;
      brand.unitsSold += line.quantity;
      byBrand.set(brandName, brand);
    }

    const toSortedArray = (map: Map<string, { revenueKes: number; unitsSold: number }>) =>
      Array.from(map.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenueKes - a.revenueKes);

    return { byCategory: toSortedArray(byCategory), byBrand: toSortedArray(byBrand) };
  }

  /**
   * New vs. returning customers within the window, plus a repeat-purchase
   * rate and a top-customers list -- all computable from Order.customerId,
   * which the platform already relies on for the Customers page's own
   * lifetime-value column (PortalCustomerService). "Returning" here means
   * the customer had at least one PAID order before this window started,
   * not just a second order within it -- a customer's 2nd-ever order
   * inside the window still counts as a first-time buyer converting, which
   * is the number a merchant actually wants from "new vs returning."
   */
  async customerInsights(shopId: string, from?: Date, to?: Date) {
    const window = resolveWindow(from, to);

    const ordersInWindow = await this.prisma.order.findMany({
      where: { shopId, status: 'PAID', createdAt: { gte: window.from, lte: window.to }, customerId: { not: null } },
      select: { customerId: true, totalKes: true, createdAt: true },
    });

    const customerIds = Array.from(new Set(ordersInWindow.map((o) => o.customerId!).filter(Boolean)));
    const priorOrderCustomerIds = customerIds.length
      ? new Set(
          (
            await this.prisma.order.findMany({
              where: { shopId, status: 'PAID', customerId: { in: customerIds }, createdAt: { lt: window.from } },
              select: { customerId: true },
              distinct: ['customerId'],
            })
          ).map((o) => o.customerId),
        )
      : new Set<string | null>();

    let newCustomerOrders = 0;
    let returningCustomerOrders = 0;
    const revenueByCustomer = new Map<string, number>();
    const ordersByCustomer = new Map<string, number>();

    for (const order of ordersInWindow) {
      const id = order.customerId!;
      if (priorOrderCustomerIds.has(id)) returningCustomerOrders++;
      else newCustomerOrders++;
      revenueByCustomer.set(id, (revenueByCustomer.get(id) ?? 0) + Number(order.totalKes));
      ordersByCustomer.set(id, (ordersByCustomer.get(id) ?? 0) + 1);
    }

    const distinctCustomers = customerIds.length;
    const returningCustomers = customerIds.filter((id) => priorOrderCustomerIds.has(id)).length;

    const topCustomerIds = Array.from(revenueByCustomer.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);
    const topCustomerRecords = topCustomerIds.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: topCustomerIds } },
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        })
      : [];

    return {
      distinctCustomers,
      newCustomers: distinctCustomers - returningCustomers,
      returningCustomers,
      // Share of orders (not customers) placed by someone who'd bought
      // before -- the number that actually reflects repeat-purchase
      // behaviour, since one loyal customer placing 5 orders should move
      // this more than 5 different first-time buyers would.
      repeatPurchaseRate: ordersInWindow.length > 0 ? returningCustomerOrders / ordersInWindow.length : 0,
      topCustomers: topCustomerIds.map((id) => {
        const record = topCustomerRecords.find((c) => c.id === id);
        return {
          id,
          name: record ? [record.firstName, record.lastName].filter(Boolean).join(' ') || 'No name' : 'Unknown',
          email: record?.email ?? null,
          phone: record?.phone ?? null,
          revenueKes: revenueByCustomer.get(id) ?? 0,
          orderCount: ordersByCustomer.get(id) ?? 0,
        };
      }),
    };
  }

  /**
   * What fraction of leads (WhatsApp orders + abandoned carts) turned into
   * an actual paid order -- the real "are my leads converting" number the
   * Leads page itself can't show per-row. A lead "converts" when the same
   * customer (matched by phone, since a WhatsApp lead's phone is the only
   * reliable identifier -- CartLead.customerId is usually null, set only
   * when the shopper happened to be logged in) placed a PAID order any time
   * from the lead's creation onward. Matching by phone rather than
   * requiring CartLead.customerId is deliberate: it's the difference
   * between this metric being populated and it always reading zero, since
   * WhatsApp-order leads are the dominant source and almost never carry a
   * logged-in customerId.
   */
  async leadConversion(shopId: string, from?: Date, to?: Date) {
    const window = resolveWindow(from, to);
    const leads = await this.prisma.cartLead.findMany({
      where: { shopId, createdAt: { gte: window.from, lte: window.to } },
      select: { id: true, source: true, customerPhone: true, createdAt: true },
    });

    const phones = Array.from(new Set(leads.map((l) => l.customerPhone).filter((p): p is string => Boolean(p))));
    const paidOrdersByPhone = phones.length
      ? await this.prisma.order.findMany({
          where: { shopId, status: 'PAID', phone: { in: phones } },
          select: { phone: true, createdAt: true, totalKes: true },
        })
      : [];

    let converted = 0;
    let convertedRevenueKes = 0;
    for (const lead of leads) {
      if (!lead.customerPhone) continue;
      const match = paidOrdersByPhone.find((o) => o.phone === lead.customerPhone && o.createdAt >= lead.createdAt);
      if (match) {
        converted++;
        convertedRevenueKes += Number(match.totalKes);
      }
    }

    const bySource = (source: 'WHATSAPP_ORDER' | 'ABANDONED_CART') => {
      const sourceLeads = leads.filter((l) => l.source === source);
      const sourceConverted = sourceLeads.filter((l) => {
        if (!l.customerPhone) return false;
        return paidOrdersByPhone.some((o) => o.phone === l.customerPhone && o.createdAt >= l.createdAt);
      }).length;
      return { total: sourceLeads.length, converted: sourceConverted };
    };

    return {
      totalLeads: leads.length,
      converted,
      conversionRate: leads.length > 0 ? converted / leads.length : 0,
      convertedRevenueKes,
      whatsappOrder: bySource('WHATSAPP_ORDER'),
      abandonedCart: bySource('ABANDONED_CART'),
    };
  }
}
