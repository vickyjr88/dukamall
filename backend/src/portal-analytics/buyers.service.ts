import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalisePhone } from '../portal-customer/portal-customer.service';

const DAY_MS = 24 * 3600_000;

export type BuyerOrder = {
  id: string; customerId: string | null; phone: string | null; email: string | null;
  firstName: string; lastName: string; totalKes: unknown; createdAt: Date;
};

/**
 * Who a buyer is. A shop that sells over WhatsApp has few logged-in customers, so the customer account is the weakest
 * identity: the phone number comes first (written any way, 0712…, +254 712… all one person), then the email, then the
 * account. An order with none of them cannot be recognised again and counts as a one-off.
 */
export function buyerKey(order: Pick<BuyerOrder, 'id' | 'customerId' | 'phone' | 'email'>): string {
  const phone = normalisePhone(order.phone);
  if (phone) return `p:${phone}`;
  const email = (order.email ?? '').trim().toLowerCase();
  if (email) return `e:${email}`;
  if (order.customerId) return `c:${order.customerId}`;
  return `o:${order.id}`;
}

type Buyer = { key: string; name: string; phone: string | null; orders: number; spendKes: number; first: Date; last: Date; recognisable: boolean };

/** Everyone who has bought, with what they have spent and when, from orders already read. Pure, so it is tested without a database. */
export function groupBuyers(orders: BuyerOrder[]): Buyer[] {
  const byKey = new Map<string, Buyer>();
  for (const o of [...orders].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const key = buyerKey(o);
    const name = `${o.firstName} ${o.lastName}`.trim();
    const b = byKey.get(key) ?? { key, name, phone: null, orders: 0, spendKes: 0, first: o.createdAt, last: o.createdAt, recognisable: !key.startsWith('o:') };
    b.orders += 1;
    b.spendKes += Number(o.totalKes);
    b.last = o.createdAt;
    if (name) b.name = name; // the most recent spelling
    if (o.phone && normalisePhone(o.phone)) b.phone = normalisePhone(o.phone);
    byKey.set(key, b);
  }
  return Array.from(byKey.values());
}

export function summariseBuyers(orders: BuyerOrder[], from: Date, to: Date, now: Date, lapseDays: number) {
  const buyers = groupBuyers(orders);
  const windowOrders = orders.filter((o) => o.createdAt >= from && o.createdAt <= to);
  const windowSpend = new Map<string, number>();
  for (const o of windowOrders) windowSpend.set(buyerKey(o), (windowSpend.get(buyerKey(o)) ?? 0) + Number(o.totalKes));
  const inWindow = buyers.filter((b) => windowSpend.has(b.key));
  const firstTimers = inWindow.filter((b) => b.first >= from && b.first <= to);
  const returning = inWindow.filter((b) => b.first < from);
  const recognisable = inWindow.filter((b) => b.recognisable);

  const returningKeys = new Set(returning.map((b) => b.key));
  const windowRevenue = windowOrders.reduce((s, o) => s + Number(o.totalKes), 0);
  const returningRevenue = windowOrders.filter((o) => returningKeys.has(buyerKey(o))).reduce((s, o) => s + Number(o.totalKes), 0);

  const everBought = buyers.filter((b) => b.recognisable);
  const lapsed = everBought
    .filter((b) => now.getTime() - b.last.getTime() > lapseDays * DAY_MS)
    // The ones worth a message first: bought more than once, then those who spent the most.
    .sort((a, b) => Number(b.orders > 1) - Number(a.orders > 1) || b.spendKes - a.spendKes)
    .slice(0, 20)
    .map((b) => ({ name: b.name || 'No name', phone: b.phone, orders: b.orders, spendKes: b.spendKes, lastOrder: b.last.toISOString().slice(0, 10), daysAgo: Math.floor((now.getTime() - b.last.getTime()) / DAY_MS) }));

  return {
    lapseDays,
    buyers: inWindow.length,
    newBuyers: firstTimers.length,
    returningBuyers: returning.length,
    /** Of the people who bought in the period, the share who had bought before it. */
    repeatRate: inWindow.length ? returning.length / inWindow.length : 0,
    /** Of the money taken in the period, the share from people who had bought before it. */
    repeatRevenueShare: windowRevenue > 0 ? returningRevenue / windowRevenue : 0,
    averageOrderKes: windowOrders.length ? windowRevenue / windowOrders.length : 0,
    /** All-time, over buyers who can be recognised again. */
    averageLifetimeKes: everBought.length ? everBought.reduce((s, b) => s + b.spendKes, 0) / everBought.length : 0,
    averageOrdersPerBuyer: everBought.length ? everBought.reduce((s, b) => s + b.orders, 0) / everBought.length : 0,
    unrecognisedOrders: windowOrders.length - windowOrders.filter((o) => !buyerKey(o).startsWith('o:')).length,
    recognisedInPeriod: recognisable.length,
    lapsed,
    lapsedCount: everBought.filter((b) => now.getTime() - b.last.getTime() > lapseDays * DAY_MS).length,
    top: [...inWindow]
      .map((b) => ({ b, spent: windowSpend.get(b.key) ?? 0 }))
      .sort((x, y) => y.spent - x.spent)
      .slice(0, 8)
      .map(({ b, spent }) => ({ name: b.name || 'No name', phone: b.phone, orders: b.orders, spentInPeriodKes: spent, lifetimeKes: b.spendKes })),
  };
}

@Injectable()
export class BuyersService {
  constructor(private prisma: PrismaService) {}

  async buyers(shopId: string, from: Date, to: Date, lapseDays = 60) {
    const orders = await this.prisma.order.findMany({
      where: { shopId, status: { not: 'CANCELLED' } },
      select: { id: true, customerId: true, phone: true, email: true, firstName: true, lastName: true, totalKes: true, createdAt: true },
    });
    return summariseBuyers(orders, from, to, new Date(), lapseDays);
  }
}
