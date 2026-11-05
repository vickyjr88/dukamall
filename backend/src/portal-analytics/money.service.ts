import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** One order line's money: what it sold for, and what it cost when the cost is known. */
export function lineMoney(line: { quantity: number; priceKes: unknown; unitCostKes: unknown; variant?: { product?: { costKes: unknown } | null } | null }) {
  const revenue = Number(line.priceKes) * line.quantity;
  // The cost kept on the line when the order was made; for an order older than that, the product's cost today.
  const unitCost = line.unitCostKes ?? line.variant?.product?.costKes ?? null;
  const cost = unitCost === null || unitCost === undefined ? null : Number(unitCost) * line.quantity;
  return { revenue, cost };
}

/** What the shop made, and kept, over a period. Pure over rows already read, so the rules are tested without a database. */
export function summariseMoney(
  orders: Array<{ status: string; totalKes: unknown; shippingKes: unknown; discountKes: unknown; lines: Parameters<typeof lineMoney>[0][] }>,
  cancelled: number,
  adSpendKes: number,
) {
  let sold = 0, paid = 0, awaiting = 0, shipping = 0, discounts = 0;
  let linesRevenue = 0, costedRevenue = 0, cost = 0;
  for (const order of orders) {
    const total = Number(order.totalKes);
    sold += total;
    if (order.status === 'PAID') paid += total; else awaiting += total;
    shipping += Number(order.shippingKes);
    discounts += Number(order.discountKes);
    for (const line of order.lines) {
      const m = lineMoney(line);
      linesRevenue += m.revenue;
      if (m.cost !== null) { costedRevenue += m.revenue; cost += m.cost; }
    }
  }
  const count = orders.length;
  // Profit is only claimed on the lines whose cost is known, and the share of sales that covers is reported with it.
  const grossProfit = costedRevenue - cost;
  return {
    orders: count,
    soldKes: sold,
    paidKes: paid,
    awaitingPaymentKes: awaiting,
    averageOrderKes: count ? sold / count : 0,
    discountsKes: discounts,
    shippingKes: shipping,
    cancelledOrders: cancelled,
    cancelledRate: count + cancelled ? cancelled / (count + cancelled) : 0,
    profit: {
      grossProfitKes: grossProfit,
      marginRate: costedRevenue > 0 ? grossProfit / costedRevenue : null,
      costCoverage: linesRevenue > 0 ? costedRevenue / linesRevenue : 0,
    },
    adSpendKes,
    costPerOrderKes: count && adSpendKes ? adSpendKes / count : null,
    returnOnAdSpend: adSpendKes > 0 ? sold / adSpendKes : null,
    profitAfterAdsKes: costedRevenue > 0 ? grossProfit - adSpendKes : null,
  };
}

@Injectable()
export class MoneyService {
  constructor(private prisma: PrismaService) {}

  async money(shopId: string, from: Date, to: Date) {
    const where = { shopId, createdAt: { gte: from, lte: to } };
    const [orders, cancelled, spend] = await Promise.all([
      this.prisma.order.findMany({
        where: { ...where, status: { not: 'CANCELLED' } },
        select: {
          status: true, totalKes: true, shippingKes: true, discountKes: true,
          lines: { select: { quantity: true, priceKes: true, unitCostKes: true, variant: { select: { product: { select: { costKes: true } } } } } },
        },
      }),
      this.prisma.order.count({ where: { ...where, status: 'CANCELLED' } }),
      this.prisma.adSpend.aggregate({
        where: { shopId, day: { gte: new Date(from.toISOString().slice(0, 10)), lte: new Date(to.toISOString().slice(0, 10)) } },
        _sum: { amountKes: true },
      }),
    ]);
    return summariseMoney(orders, cancelled, Number(spend._sum.amountKes ?? 0));
  }
}
