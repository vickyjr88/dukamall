import { BadRequestException } from '@nestjs/common';
import { cleanAdSpend } from '../../src/portal-analytics/ad-spend.service';
import { lineMoney, summariseMoney } from '../../src/portal-analytics/money.service';
import { buyerKey, groupBuyers, summariseBuyers } from '../../src/portal-analytics/buyers.service';

describe('ad spend entries', () => {
  it('names the source the way the Analytics page does and rounds the amount', () => {
    const row = cleanAdSpend({ day: '2026-11-03', source: ' fb ', amountKes: '1500.456', campaign: 'roma' });
    expect(row).toMatchObject({ source: 'Facebook', amountKes: 1500.46, campaign: 'roma' });
    expect(row.day.toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });

  it('refuses nonsense', () => {
    expect(() => cleanAdSpend({ day: 'yesterday', source: 'tiktok', amountKes: 10 })).toThrow(BadRequestException);
    expect(() => cleanAdSpend({ day: '2026-11-03', source: '', amountKes: 10 })).toThrow(BadRequestException);
    expect(() => cleanAdSpend({ day: '2026-11-03', source: 'tiktok', amountKes: 0 })).toThrow(BadRequestException);
    expect(() => cleanAdSpend({ day: '2026-11-03', source: 'tiktok', amountKes: -5 })).toThrow(BadRequestException);
    expect(() => cleanAdSpend({ day: '2099-01-01', source: 'tiktok', amountKes: 5 })).toThrow(BadRequestException);
  });
});

describe('profit', () => {
  it('uses the cost kept on the line, then the product\'s cost today, and claims nothing when neither is known', () => {
    expect(lineMoney({ quantity: 2, priceKes: 4200, unitCostKes: 2600, variant: { product: { costKes: 9999 } } })).toEqual({ revenue: 8400, cost: 5200 });
    expect(lineMoney({ quantity: 1, priceKes: 4200, unitCostKes: null, variant: { product: { costKes: 2800 } } })).toEqual({ revenue: 4200, cost: 2800 });
    expect(lineMoney({ quantity: 1, priceKes: 4200, unitCostKes: null, variant: { product: { costKes: null } } })).toEqual({ revenue: 4200, cost: null });
  });

  const order = (status: string, total: number, lines: any[], extra: any = {}) => ({ status, totalKes: total, shippingKes: 0, discountKes: 0, lines, ...extra });
  const costed = { quantity: 1, priceKes: 4000, unitCostKes: 2500, variant: null };
  const uncosted = { quantity: 1, priceKes: 6000, unitCostKes: null, variant: { product: { costKes: null } } };

  it('adds up sales, what is paid and what is still owed, and the average order', () => {
    const m = summariseMoney([order('PAID', 4000, [costed]), order('PENDING', 6000, [uncosted])], 1, 0);
    expect(m).toMatchObject({ orders: 2, soldKes: 10000, paidKes: 4000, awaitingPaymentKes: 6000, averageOrderKes: 5000, cancelledOrders: 1 });
    expect(m.cancelledRate).toBeCloseTo(1 / 3);
  });

  it('reports profit only on what has a cost, and says how much of the sales that covers', () => {
    const m = summariseMoney([order('PAID', 4000, [costed]), order('PAID', 6000, [uncosted])], 0, 0);
    expect(m.profit.grossProfitKes).toBe(1500);
    expect(m.profit.marginRate).toBeCloseTo(0.375);
    expect(m.profit.costCoverage).toBeCloseTo(0.4);
  });

  it('sets ad spend against sales and profit', () => {
    const m = summariseMoney([order('PAID', 4000, [costed]), order('PAID', 4000, [costed])], 0, 2000);
    expect(m).toMatchObject({ adSpendKes: 2000, costPerOrderKes: 1000, returnOnAdSpend: 4, profitAfterAdsKes: 1000 });
  });

  it('has no ratios to show with no orders, no spend or no costs', () => {
    const none = summariseMoney([], 0, 0);
    expect(none).toMatchObject({ orders: 0, averageOrderKes: 0, costPerOrderKes: null, returnOnAdSpend: null, profitAfterAdsKes: null });
    expect(none.profit.marginRate).toBeNull();
    expect(summariseMoney([order('PAID', 6000, [uncosted])], 0, 500).profitAfterAdsKes).toBeNull();
  });
});

describe('who a buyer is', () => {
  const o = (over: any) => ({ id: Math.random().toString(36).slice(2), customerId: null, phone: null, email: null, firstName: 'A', lastName: 'B', totalKes: 1000, createdAt: new Date('2026-10-01'), ...over });

  it('recognises one person across spellings of their number', () => {
    const keys = new Set(['0712 345 678', '+254712345678', '254712345678'].map((phone) => buyerKey(o({ phone }))));
    expect(keys.size).toBe(1);
  });

  it('falls back to email, then account, and treats an unidentifiable order as a one-off', () => {
    expect(buyerKey(o({ email: ' Jo@Example.com ' }))).toBe('e:jo@example.com');
    expect(buyerKey(o({ customerId: 'c1' }))).toBe('c:c1');
    expect(buyerKey(o({ id: 'x1' }))).toBe('o:x1');
    expect(buyerKey(o({ id: 'x1' }))).not.toBe(buyerKey(o({ id: 'x2' })));
  });

  it('groups orders into buyers with spend, first and last order', () => {
    const buyers = groupBuyers([
      o({ phone: '0712345678', totalKes: 4000, createdAt: new Date('2026-08-01'), firstName: 'Wanjiru' }),
      o({ phone: '+254712345678', totalKes: 3000, createdAt: new Date('2026-10-20'), firstName: 'Wanjiru', lastName: 'K' }),
    ]);
    expect(buyers).toHaveLength(1);
    expect(buyers[0]).toMatchObject({ orders: 2, spendKes: 7000, name: 'Wanjiru K', phone: '254712345678' });
    expect(buyers[0].first.toISOString().slice(0, 10)).toBe('2026-08-01');
    expect(buyers[0].last.toISOString().slice(0, 10)).toBe('2026-10-20');
  });
});

describe('repeat buyers and win-back', () => {
  const o = (phone: string | null, total: number, date: string, name = 'X') => ({ id: `${phone}${date}`, customerId: null, phone, email: null, firstName: name, lastName: '', totalKes: total, createdAt: new Date(date) });
  const now = new Date('2026-11-05');
  const from = new Date('2026-10-06');
  const to = new Date('2026-11-05');

  const orders = [
    o('0711000001', 4000, '2026-07-01', 'Old'), o('0711000001', 4000, '2026-10-10', 'Old'),     // returning, bought before the period
    o('0711000002', 5000, '2026-10-12', 'New'),                                                  // first-timer
    o('0711000003', 3000, '2026-06-01', 'Gone'), o('0711000003', 3500, '2026-07-01', 'Gone'),   // bought twice, quiet since July
    o('0711000004', 9000, '2026-05-01', 'Big'),                                                  // bought once, long ago, big spend
    o(null, 2000, '2026-10-15', 'Walk'),                                                         // cannot be recognised again
  ];
  const r = summariseBuyers(orders, from, to, now, 60);

  it('splits the period\'s buyers into new and returning', () => {
    expect(r).toMatchObject({ buyers: 3, newBuyers: 2, returningBuyers: 1 });
    expect(r.repeatRate).toBeCloseTo(1 / 3);
    // 4000 of the 11000 taken in the period came from someone who had bought before.
    expect(r.repeatRevenueShare).toBeCloseTo(4000 / 11000);
    expect(r.unrecognisedOrders).toBe(1);
  });

  it('lists who has gone quiet, repeat buyers first, then by spend', () => {
    expect(r.lapsedCount).toBe(2);
    expect(r.lapsed.map((l) => l.name)).toEqual(['Gone', 'Big']);
    expect(r.lapsed[0]).toMatchObject({ orders: 2, spendKes: 6500, lastOrder: '2026-07-01' });
    expect(r.lapsed[0].phone).toBe('254711000003');
  });

  it('averages lifetime value over buyers it can recognise', () => {
    // Old 8000, New 5000, Gone 6500, Big 9000 -> 28500 / 4
    expect(r.averageLifetimeKes).toBeCloseTo(28500 / 4);
    expect(r.averageOrdersPerBuyer).toBeCloseTo(6 / 4); // 2+1+2+1 orders over 4 buyers
  });

  it('is empty, not broken, with no orders', () => {
    expect(summariseBuyers([], from, to, now, 60)).toMatchObject({ buyers: 0, repeatRate: 0, lapsed: [], averageLifetimeKes: 0 });
  });
});
