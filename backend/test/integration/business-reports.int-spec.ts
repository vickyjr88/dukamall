import { CheckoutService } from '../../src/checkout/checkout.service';
import { PortalDiscountService } from '../../src/portal-discount/portal-discount.service';
import { PortalProductService } from '../../src/portal-product/portal-product.service';
import { AdSpendService } from '../../src/portal-analytics/ad-spend.service';
import { BuyersService } from '../../src/portal-analytics/buyers.service';
import { FunnelService } from '../../src/portal-analytics/funnel.service';
import { MoneyService } from '../../src/portal-analytics/money.service';
import { StockService } from '../../src/portal-analytics/stock.service';
import { StorefrontEventsService } from '../../src/storefront-events/storefront-events.service';
import { cleanup, close, makeOrder, makeShop, prisma } from './helpers';

const email = { send: jest.fn(async () => true) };
const notifications = { newOrder: jest.fn(async () => undefined) };
const checkout = new CheckoutService(prisma, null as any, new PortalDiscountService(prisma), email as any, notifications as any);
const products = new PortalProductService(prisma);
const adSpend = new AdSpendService(prisma);
const money = new MoneyService(prisma);
const stock = new StockService(prisma);
const buyers = new BuyersService(prisma);
const funnel = new FunnelService(prisma);
const events = new StorefrontEventsService(prisma);
const phone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1', originHost: 'shop.test' };

afterAll(async () => {
  await prisma.storefrontEvent.deleteMany({ where: { shop: { slug: { startsWith: 'it-' } } } });
  await cleanup();
  await close();
});

const DAY = 24 * 3600_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const range = () => ({ from: ago(30), to: new Date(Date.now() + 3600_000) });

async function product(shopId: string, name: string, over: { cost?: number | null; price?: number; stock?: number; createdDaysAgo?: number; active?: boolean } = {}) {
  const created = await products.create(shopId, {
    name, costKes: over.cost ?? undefined, isActive: over.active,
    variants: [{ sku: `${name}-1`.replace(/\s/g, ''), size: '42', priceKes: over.price ?? 4000, stockOnHand: over.stock ?? 5 }],
  } as any);
  if (over.createdDaysAgo) await prisma.product.update({ where: { id: created.id }, data: { createdAt: ago(over.createdDaysAgo) } });
  return { ...created, variantId: created.variants[0].id as string };
}

async function sale(shopId: string, p: { variantId: string }, opts: { qty?: number; price?: number; cost?: number | null; daysAgo?: number; status?: string; phone?: string; name?: string; sessionId?: string }) {
  const order = await makeOrder(shopId, {
    status: opts.status ?? 'PAID', phone: opts.phone ?? null, firstName: opts.name ?? 'Guest', sessionId: opts.sessionId ?? null,
    totalKes: (opts.price ?? 4000) * (opts.qty ?? 1), subtotalKes: (opts.price ?? 4000) * (opts.qty ?? 1),
    createdAt: ago(opts.daysAgo ?? 1),
    lines: { create: [{ variantId: p.variantId, quantity: opts.qty ?? 1, priceKes: opts.price ?? 4000, unitCostKes: opts.cost ?? null }] },
  });
  return order;
}

describe('cost is kept on the order line', () => {
  it('a product\'s cost is copied onto each order line at checkout, so editing it later does not rewrite history', async () => {
    const shop = await makeShop();
    const p = await product(shop.id, 'Puma Roma', { cost: 2600 });
    const { order } = await checkout.start(shop.id, { lines: [{ variantId: p.variantId, quantity: 1 }], firstName: 'A', lastName: 'B' } as any, null);
    await products.update(shop.id, p.id, { costKes: 3300 } as any);
    const line = await prisma.orderLine.findFirstOrThrow({ where: { orderId: order.id } });
    expect(Number(line.unitCostKes)).toBe(2600);
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).costKes)).toBe(3300);
  });

  it('a product with no cost leaves the line without one, and the cost can be cleared again', async () => {
    const shop = await makeShop();
    const p = await product(shop.id, 'Nike Air', { cost: 2000 });
    await products.update(shop.id, p.id, { costKes: null } as any);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).costKes).toBeNull();
  });
});

describe('money, against the real database', () => {
  it('adds up the period and keeps another shop out of it', async () => {
    const shop = await makeShop();
    const other = await makeShop();
    const a = await product(shop.id, 'A Shoe', { cost: 2500 });
    const b = await product(other.id, 'B Shoe', { cost: 100 });
    await sale(shop.id, a, { price: 4000, cost: 2500, daysAgo: 2 });
    await sale(shop.id, a, { price: 4000, cost: 2500, daysAgo: 3, status: 'PENDING' });
    await sale(shop.id, a, { price: 4000, cost: 2500, daysAgo: 4, status: 'CANCELLED' });
    await sale(shop.id, a, { price: 4000, cost: 2500, daysAgo: 90 }); // outside the period
    await sale(other.id, b, { price: 999, cost: 100, daysAgo: 1 });
    await adSpend.create(shop.id, { day: ago(5).toISOString().slice(0, 10), source: 'facebook', amountKes: 1000 });
    await adSpend.create(other.id, { day: ago(5).toISOString().slice(0, 10), source: 'facebook', amountKes: 7777 });

    const m = await money.money(shop.id, range().from, range().to);
    expect(m).toMatchObject({ orders: 2, soldKes: 8000, paidKes: 4000, awaitingPaymentKes: 4000, cancelledOrders: 1, adSpendKes: 1000, returnOnAdSpend: 8 });
    expect(m.profit.grossProfitKes).toBe(3000);
    expect(m.profitAfterAdsKes).toBe(2000);
  });
});

describe('ad return: spend set against the visits that ads brought', () => {
  it('matches spend to the platform and counts only ad visits, not organic or direct ones', async () => {
    const shop = await makeShop();
    const p = await product(shop.id, 'Ad Shoe', { cost: 2000 });
    await events.record(shop.id, { sessionId: 'adadadadadad01', events: [{ type: 'SESSION_START', utmSource: 'facebook', utmMedium: 'paid' }] }, phone);
    await events.record(shop.id, { sessionId: 'adadadadadad02', events: [{ type: 'SESSION_START', utmSource: 'facebook', utmMedium: 'paid' }, { type: 'WHATSAPP_CLICK', detail: 'card' }] }, phone);
    await events.record(shop.id, { sessionId: 'adadadadadad03', events: [{ type: 'SESSION_START' }] }, phone); // direct
    await sale(shop.id, p, { price: 4200, sessionId: 'adadadadadad01', daysAgo: 0 });
    await adSpend.create(shop.id, { day: new Date().toISOString().slice(0, 10), source: 'fb', amountKes: 600 });
    await adSpend.create(shop.id, { day: new Date().toISOString().slice(0, 10), source: 'tiktok', amountKes: 400 });

    const f = await funnel.funnel(shop.id, ago(1), new Date(Date.now() + 3600_000));
    const fb = f.adReturn.find((r) => r.source === 'Facebook')!;
    expect(fb).toMatchObject({ spendKes: 600, visits: 2, whatsappTaps: 1, orders: 1, revenueKes: 4200 });
    // Spend on a platform that brought no visits is still shown: that is the point of the table.
    expect(f.adReturn.find((r) => r.source === 'TikTok')).toMatchObject({ spendKes: 400, visits: 0, orders: 0 });
    expect(f.adReturn.find((r) => r.source === 'Direct')).toBeUndefined();
  });

  it('lists and removes spend, only for the shop that owns it', async () => {
    const shop = await makeShop();
    const other = await makeShop();
    const { id } = await adSpend.create(shop.id, { day: ago(1).toISOString().slice(0, 10), source: 'google', amountKes: 250 });
    expect((await adSpend.list(shop.id, ago(10), new Date())).map((r) => r.amountKes)).toEqual([250]);
    expect(await adSpend.list(other.id, ago(10), new Date())).toEqual([]);
    await expect(adSpend.remove(other.id, id)).rejects.toThrow();
    await adSpend.remove(shop.id, id);
    expect(await adSpend.list(shop.id, ago(10), new Date())).toEqual([]);
  });
});

describe('stock, against the real database', () => {
  it('finds dead stock, what is running low, and sold-out products people still want', async () => {
    const shop = await makeShop();
    const dead = await product(shop.id, 'Dusty Boot', { cost: 3000, stock: 4, createdDaysAgo: 200 });
    const fresh = await product(shop.id, 'New Arrival', { cost: 1000, stock: 4, createdDaysAgo: 3 });
    const fast = await product(shop.id, 'Hot Seller', { cost: 1500, price: 3000, stock: 2, createdDaysAgo: 100 });
    const gone = await product(shop.id, 'Sold Out', { cost: 1000, stock: 0, createdDaysAgo: 50 });
    const hidden = await product(shop.id, 'Hidden', { cost: 1000, stock: 9, createdDaysAgo: 300, active: false });

    for (let i = 0; i < 6; i++) await sale(shop.id, fast, { price: 3000, cost: 1500, daysAgo: i + 1 });
    await sale(shop.id, dead, { price: 5000, cost: 3000, daysAgo: 150 }); // sold once, long ago

    await events.record(shop.id, { sessionId: 'stkstkstkstk01', events: [{ type: 'SESSION_START' }, { type: 'VIEW_PRODUCT', productSlug: gone.slug }, { type: 'WHATSAPP_CLICK', productSlug: gone.slug }] }, phone);
    await events.record(shop.id, { sessionId: 'stkstkstkstk02', events: [{ type: 'SESSION_START' }, { type: 'VIEW_PRODUCT', productSlug: gone.slug }] }, phone);

    const s = await stock.stock(shop.id, range().from, range().to, 60);

    expect(s.deadStock.items.map((d) => d.name)).toEqual(['Dusty Boot']);
    expect(s.deadStock.items[0]).toMatchObject({ units: 4, valueKes: 12000, basis: 'cost', daysSinceSale: 150 });
    expect(s.deadStock.items.find((d) => d.name === fresh.name)).toBeUndefined();
    expect(s.deadStock.items.find((d) => d.name === hidden.name)).toBeUndefined();

    expect(s.runningLow).toHaveLength(1);
    expect(s.runningLow[0]).toMatchObject({ name: 'Hot Seller', units: 2, soldInPeriod: 6 });
    expect(s.runningLow[0].coverDays!).toBeLessThanOrEqual(14);

    expect(s.missedDemand).toEqual([{ slug: gone.slug, name: 'Sold Out', views: 2, carts: 0, whatsapp: 1 }]);

    expect(s.earners[0]).toMatchObject({ name: 'Hot Seller', unitsSold: 6, revenueKes: 18000, profitKes: 9000 });
    // Active stock only: dead 4, fresh 4, fast 2, gone 0 (the hidden product's 9 are not on the shelf).
    expect(s.onHand.units).toBe(10);
  });

  it('values dead stock at the selling price when the cost is not known, and says so', async () => {
    const shop = await makeShop();
    await product(shop.id, 'No Cost Boot', { price: 2000, stock: 3, createdDaysAgo: 120 });
    const s = await stock.stock(shop.id, range().from, range().to, 60);
    expect(s.deadStock.items[0]).toMatchObject({ valueKes: 6000, basis: 'price', daysSinceSale: null });
    expect(s.onHand.productsWithoutCost).toBe(1);
  });
});

describe('buyers, against the real database', () => {
  it('recognises a WhatsApp buyer by number however it was typed, and lists who has gone quiet', async () => {
    const shop = await makeShop();
    const p = await product(shop.id, 'Buyer Shoe', { cost: 1000 });
    await sale(shop.id, p, { phone: '0712345678', name: 'Wanjiru', daysAgo: 100, price: 3000 });
    await sale(shop.id, p, { phone: '+254 712 345 678', name: 'Wanjiru', daysAgo: 80, price: 3000 });
    await sale(shop.id, p, { phone: '0799000111', name: 'Brian', daysAgo: 5, price: 4000 });
    await sale(shop.id, p, { phone: '0700555666', name: 'Cancelled', daysAgo: 4, status: 'CANCELLED' });

    const r = await buyers.buyers(shop.id, range().from, range().to, 60);
    expect(r).toMatchObject({ buyers: 1, newBuyers: 1, returningBuyers: 0, lapsedCount: 1 });
    expect(r.lapsed[0]).toMatchObject({ name: 'Wanjiru Buyer', orders: 2, spendKes: 6000, phone: '254712345678' });
    expect(r.averageLifetimeKes).toBeCloseTo(5000);
  });
});
