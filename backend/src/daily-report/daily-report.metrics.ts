import type { Comparison, DaySummary, Seller, Split, StockItem } from './daily-report.types';

export type OrderFact = {
  orderNumber: string;
  status: string;
  total: number;
  discount: number;
  method: string;
  source: string;
  lines: { variantId: string; sku: string; productName: string; quantity: number; lineTotal: number }[];
};

/**
 * `placed` is the orders created that day; `paid` is the orders whose payment landed that day. They overlap but are
 * not the same set: an order placed on Monday night and paid on Tuesday is Tuesday's revenue.
 */
export function summariseDay(placed: OrderFact[], paid: OrderFact[]): DaySummary {
  const revenue = paid.reduce((sum, o) => sum + o.total, 0);
  const discounted = paid.filter((o) => o.discount > 0);
  return {
    placed: placed.length,
    cancelled: placed.filter((o) => o.status === 'CANCELLED').length,
    unpaid: placed.filter((o) => o.status === 'PENDING').length,
    paidOrders: paid.length,
    revenue,
    items: paid.reduce((sum, o) => sum + o.lines.reduce((n, l) => n + l.quantity, 0), 0),
    averageOrder: paid.length ? revenue / paid.length : 0,
    discounts: discounted.reduce((sum, o) => sum + o.discount, 0),
    discountedOrders: discounted.length,
  };
}

/** Percent change, or null when there is nothing earlier to compare with (0 to 5 is not "infinite percent"). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function compare(label: string, today: DaySummary, earlier: DaySummary): Comparison {
  return {
    label,
    revenue: earlier.revenue,
    orders: earlier.paidOrders,
    revenueChange: pctChange(today.revenue, earlier.revenue),
    ordersChange: pctChange(today.paidOrders, earlier.paidOrders),
  };
}

export function topSellers(paid: OrderFact[], limit: number): Seller[] {
  const byProduct = new Map<string, Seller>();
  for (const order of paid) {
    for (const line of order.lines) {
      const seller = byProduct.get(line.productName) ?? { name: line.productName, units: 0, revenue: 0 };
      seller.units += line.quantity;
      seller.revenue += line.lineTotal;
      byProduct.set(line.productName, seller);
    }
  }
  return [...byProduct.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, limit);
}

/** Revenue split by an order attribute (where it came from, how it was paid). */
export function splitBy(paid: OrderFact[], key: 'source' | 'method'): Split[] {
  const groups = new Map<string, Split>();
  for (const o of paid) {
    const name = o[key] || 'Unknown';
    const g = groups.get(name) ?? { name, orders: 0, revenue: 0 };
    g.orders++;
    g.revenue += o.total;
    groups.set(name, g);
  }
  return [...groups.values()].sort((a, b) => b.revenue - a.revenue);
}

export function soldVariants(paid: OrderFact[]): { variantId: string; sku: string; name: string }[] {
  const seen = new Map<string, { variantId: string; sku: string; name: string }>();
  for (const order of paid) {
    for (const line of order.lines) {
      if (!seen.has(line.variantId)) seen.set(line.variantId, { variantId: line.variantId, sku: line.sku, name: line.productName });
    }
  }
  return [...seen.values()];
}

/**
 * Only sizes that sold are checked. A shop-wide "out of stock" list is mostly noise; a size that sold and is now
 * gone is a restocking decision.
 */
export function classifyStock(
  sold: { variantId: string; sku: string; name: string }[],
  onHand: Map<string, number>,
  lowAt = 3,
): { soldOut: StockItem[]; low: StockItem[] } {
  const soldOut: StockItem[] = [];
  const low: StockItem[] = [];
  for (const v of sold) {
    const qty = onHand.get(v.variantId) ?? 0;
    const item = { name: v.name, sku: v.sku, onHand: qty };
    if (qty <= 0) soldOut.push(item);
    else if (qty <= lowAt) low.push(item);
  }
  return { soldOut, low };
}

export function formatMoney(amount: number, currency = 'KES') {
  return `${currency} ${Math.round(amount).toLocaleString('en-KE')}`;
}

export function formatChange(change: number | null): string {
  if (change === null) return 'new';
  const rounded = Math.round(change);
  if (rounded === 0) return 'no change';
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded)}%`;
}

const LABELS: Record<string, string> = {
  WEBSITE: 'Website', WHATSAPP: 'WhatsApp', IN_PERSON: 'In person', OTHER: 'Other',
  PAYSTACK: 'Card / Paystack', CASH: 'Cash', MPESA: 'M-Pesa', BANK_TRANSFER: 'Bank transfer',
};
export const label = (value: string | null | undefined, fallback = 'Unknown') => (value ? LABELS[value] ?? value : fallback);
