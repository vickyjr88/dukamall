import { classifyStock, compare, formatChange, pctChange, soldVariants, splitBy, summariseDay, topSellers, type OrderFact } from '../../src/daily-report/daily-report.metrics';
import { renderEmail, whatsappParams } from '../../src/daily-report/daily-report.render';
import { shiftDateKey, windowForDate, yesterdayKey } from '../../src/daily-report/daily-report.window';
import type { DailyReport } from '../../src/daily-report/daily-report.types';
import { WhatsAppService } from '../../src/daily-report/whatsapp.service';

const line = (variantId: string, productName: string, quantity: number, lineTotal: number) => ({ variantId, sku: `SKU-${variantId}`, productName, quantity, lineTotal });
const order = (status: string, total: number, lines: OrderFact['lines'] = [], over: Partial<OrderFact> = {}): OrderFact => ({
  orderNumber: `NG-${status}-${total}`, status, total, discount: 0, method: 'M-Pesa', source: 'Website', lines, ...over,
});

describe('report day', () => {
  it('is a Nairobi day, not a UTC day', () => {
    const w = windowForDate('2026-11-04');
    expect(w.start.toISOString()).toBe('2026-11-03T21:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-11-04T21:00:00.000Z');
    expect(w.label).toBe('Wed 4 Nov 2026');
  });

  it('decides "yesterday" in Nairobi time', () => {
    expect(yesterdayKey(new Date('2026-11-05T04:00:00Z'))).toBe('2026-11-04'); // 07:00 EAT on the 5th
    expect(yesterdayKey(new Date('2026-11-04T22:30:00Z'))).toBe('2026-11-04'); // already 01:30 on the 5th
    expect(yesterdayKey(new Date('2026-11-04T20:59:00Z'))).toBe('2026-11-03'); // 23:59 on the 4th
  });

  it('shifts dates across month and year ends', () => {
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDateKey('2027-01-01', -1)).toBe('2026-12-31');
    expect(shiftDateKey('2026-11-04', -7)).toBe('2026-10-28');
  });

  it('rejects a malformed date', () => {
    expect(() => windowForDate('4/11/2026')).toThrow();
  });
});

describe('summariseDay', () => {
  it('counts revenue from orders paid that day, even if placed earlier, and keeps unpaid/cancelled out of it', () => {
    const placed = [order('PENDING', 900), order('CANCELLED', 700), order('PAID', 2000)];
    const paid = [order('PAID', 2000, [line('a', 'Nike', 2, 2000)], { discount: 200 }), order('PAID', 1000, [line('b', 'Puma', 1, 1000)])]; // second was placed yesterday
    const s = summariseDay(placed, paid);
    expect(s).toMatchObject({ placed: 3, cancelled: 1, unpaid: 1, paidOrders: 2, revenue: 3000, items: 3, averageOrder: 1500, discounts: 200, discountedOrders: 1 });
  });

  it('is all zeros on a quiet day', () => {
    expect(summariseDay([], [])).toMatchObject({ revenue: 0, averageOrder: 0, paidOrders: 0 });
  });
});

describe('comparisons', () => {
  it('handles a zero baseline', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(5, 0)).toBeNull();
    expect(formatChange(null)).toBe('new');
    expect(formatChange(0.2)).toBe('no change');
    expect(formatChange(12.4)).toBe('+12%');
    expect(formatChange(-4.6)).toBe('-5%');
  });

  it('reports the earlier day and the change', () => {
    const today = summariseDay([], [order('PAID', 2000, [line('a', 'A', 1, 2000)])]);
    const earlier = summariseDay([], [order('PAID', 1000, [line('a', 'A', 1, 1000)])]);
    expect(compare('day before', today, earlier)).toMatchObject({ revenue: 1000, revenueChange: 100 });
  });
});

describe('best sellers, splits and stock', () => {
  const paid = [
    order('PAID', 0, [line('a', 'Nike AF1', 1, 4000), line('b', 'Puma', 3, 6000)], { source: 'WhatsApp', method: 'Cash', total: 10000 }),
    order('PAID', 0, [line('c', 'Nike AF1', 2, 8000)], { total: 8000 }),
  ];

  it('ranks by units then revenue', () => {
    const s = topSellers(paid, 5);
    expect(s.map((x) => [x.name, x.units])).toEqual([['Nike AF1', 3], ['Puma', 3]]);
    expect(s[0].revenue).toBe(12000);
  });

  it('splits revenue by source and payment, biggest first', () => {
    expect(splitBy(paid, 'source').map((x) => [x.name, x.orders, x.revenue])).toEqual([['WhatsApp', 1, 10000], ['Website', 1, 8000]]);
    expect(splitBy(paid, 'method')[0].name).toBe('Cash');
  });

  it('warns only about sizes that sold', () => {
    const sold = soldVariants(paid);
    expect(sold).toHaveLength(3);
    const { soldOut, low } = classifyStock(sold, new Map([['a', 0], ['b', 2], ['c', 40]]));
    expect(soldOut.map((x) => x.name)).toEqual(['Nike AF1']);
    expect(low.map((x) => x.name)).toEqual(['Puma']);
  });
});

const baseReport = (over: Partial<DailyReport> = {}): DailyReport => {
  const empty = summariseDay([], []);
  return {
    shopName: 'Nairobi Gents', currency: 'KES', dateKey: '2026-11-04', label: 'Wed 4 Nov 2026', generatedAt: '2026-11-05T04:00:00Z',
    today: empty, vsPreviousDay: compare('day before', empty, empty), vsLastWeek: compare('last week', empty, empty),
    orders: [], ordersOmitted: 0,
    needsAction: { awaitingShipment: { count: 0, oldest: [] }, unpaidOver24h: { count: 0, value: 0, oldest: [] } },
    topSellers: [], stock: { soldOut: [], low: [] },
    demand: { abandonedCarts: 0, abandonedValue: 0, whatsappOrderLeads: 0, newCustomers: 0 },
    bySource: [], byPayment: [],
    catalogue: { activeProducts: 148, missingPhoto: 0, feedItems: 825, noStockAnywhere: 0, syncedAwaitingStock: 0 },
    ...over,
  };
};

describe('email', () => {
  it('still renders on a quiet day, and says so', () => {
    const { subject, html } = renderEmail(baseReport());
    expect(subject).toContain('no paid orders');
    expect(html).toContain('No orders were placed or paid');
    expect(html).not.toContain('Needs your attention');
  });

  it('escapes customer text', () => {
    const { html } = renderEmail(baseReport({ orders: [{ orderNumber: 'NG-1', customer: '<script>alert(1)</script>', status: 'PAID', method: 'M-Pesa', source: 'Website', total: 100 }] }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('flags synced products with no stock, which customers cannot buy', () => {
    const { html } = renderEmail(baseReport({ catalogue: { activeProducts: 148, missingPhoto: 0, feedItems: 825, noStockAnywhere: 20, syncedAwaitingStock: 16 } }));
    expect(html).toContain('16 products copied from Drip Emporium still have no stock set');
    expect(html).toContain('4 other live products are out of stock in every size');
  });

  it('lists what needs attention and counts it for WhatsApp', () => {
    const r = baseReport({ needsAction: { awaitingShipment: { count: 2, oldest: [{ orderNumber: 'NG-9', customer: 'A', total: 1, ageHours: 30 }] }, unpaidOver24h: { count: 1, value: 500, oldest: [] } } });
    expect(renderEmail(r).html).toContain('NG-9 (30h)');
    expect(whatsappParams(r)).toEqual(['Nairobi Gents', 'Wed 4 Nov 2026', '0', 'KES 0', 'no change', '3 items']);
  });
});

describe('WhatsApp numbers', () => {
  it('are normalised to country-code digits', () => {
    const w = new WhatsAppService();
    expect(w.normalisePhone('0722 000 111')).toBe('254722000111');
    expect(w.normalisePhone('+254 722-000-111')).toBe('254722000111');
    expect(w.normalisePhone('722000111')).toBe('254722000111');
    expect(w.normalisePhone('abc')).toBeNull();
  });
});
