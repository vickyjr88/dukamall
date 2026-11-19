import { PortalProductService } from '../../src/portal-product/portal-product.service';
import { PortalOrderService } from '../../src/portal-order/portal-order.service';
import { CartLeadService } from '../../src/cart-lead/cart-lead.service';
import { OverviewService } from '../../src/portal-analytics/overview.service';
import { PortalShareService } from '../../src/portal-share/portal-share.service';
import { cleanup, close, makeOrder, makeShop, makeVariant, prisma } from './helpers';

const products = new PortalProductService(prisma);
const orders = new PortalOrderService(prisma, null as any);
const leads = new CartLeadService(prisma, { newOrder: jest.fn() } as any);
const overview = new OverviewService(prisma);
const share = new PortalShareService(prisma);

afterAll(async () => {
  await prisma.shareEvent.deleteMany({ where: { shop: { slug: { startsWith: 'it-' } } } });
  await prisma.storefrontEvent.deleteMany({ where: { shop: { slug: { startsWith: 'it-' } } } });
  await cleanup();
  await close();
});

const names = (r: { products: Array<{ name: string }> }) => r.products.map((p) => p.name);

describe('the products list, against the real database', () => {
  it('sorts by price, stock and sales, filters by stock state, counts the chips, and keeps shops apart', async () => {
    const shop = await makeShop();
    const other = await makeShop();
    const cheap = await makeVariant(shop.id, 500, 20, 'Cheap');
    const dear = await makeVariant(shop.id, 9000, 2, 'Dear');
    const gone = await makeVariant(shop.id, 1500, 0, 'Gone');
    await makeVariant(other.id, 1, 1, 'Not mine');
    // Cheap has sold 7 in the last 30 days (one order cancelled and so not counted), Dear 1.
    const sell = (variantId: string, quantity: number, status = 'PAID') => makeOrder(shop.id, { status, lines: { create: [{ variantId, quantity, priceKes: 100 }] } });
    await sell(cheap.id, 7); await sell(cheap.id, 50, 'CANCELLED'); await sell(dear.id, 1);

    expect(names(await products.list(shop.id, { sort: 'price_desc' }))).toEqual(['Dear', 'Gone', 'Cheap']);
    expect(names(await products.list(shop.id, { sort: 'price_asc' }))).toEqual(['Cheap', 'Gone', 'Dear']);
    expect(names(await products.list(shop.id, { sort: 'stock_asc' }))[0]).toBe('Gone');
    expect(names(await products.list(shop.id, { sort: 'sold' }))).toEqual(['Cheap', 'Dear', 'Gone']);

    const all = await products.list(shop.id, {});
    expect(all.total).toBe(3);
    expect(all.facets).toMatchObject({ all: 3, out: 1, low: 1 });
    expect(all.products.find((p) => p.name === 'Cheap')!.sold30).toBe(7);
    expect(all.products.find((p) => p.name === 'Cheap')!.summary.stockState).toBe('in');

    expect(names(await products.list(shop.id, { stock: 'low' }))).toEqual(['Dear']);
    expect(names(await products.list(shop.id, { stock: 'out' }))).toEqual(['Gone']);
    expect(names(await products.list(shop.id, { flag: 'no_photo' })).sort()).toEqual(['Cheap', 'Dear', 'Gone']);
    // Search matches a SKU as well as a name.
    expect(names(await products.list(shop.id, { search: cheap.sku.toLowerCase() }))).toEqual(['Cheap']);
    expect((await products.list(other.id, {})).total).toBe(1);
  });

  it('pages without repeating or dropping a product, and clamps a page past the end', async () => {
    const shop = await makeShop();
    for (let i = 1; i <= 5; i++) await makeVariant(shop.id, 100 * i, 5, `Item ${i}`);
    const seen: string[] = [];
    for (const page of [1, 2, 3]) seen.push(...names(await products.list(shop.id, { sort: 'price_asc', page, pageSize: 2 })));
    expect(seen).toEqual(['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5']);
    const past = await products.list(shop.id, { page: 99, pageSize: 2 });
    expect(past.page).toBe(3);
    expect(past.products).toHaveLength(1);
  });

  it('shows or hides, and features, only this shop\'s own products', async () => {
    const shop = await makeShop();
    const other = await makeShop();
    const mine = await makeVariant(shop.id, 100, 5, 'Mine');
    const theirs = await makeVariant(other.id, 100, 5, 'Theirs');
    const r = await products.setActiveMany(shop.id, [mine.productId, theirs.productId], false);
    expect(r).toEqual({ updated: 1, notFound: 1 });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: theirs.productId } })).isActive).toBe(true);
    await products.setFeaturedMany(shop.id, [mine.productId], true);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: mine.productId } })).isFeatured).toBe(true);
  });
});

describe('the orders and leads lists', () => {
  it('sorts orders, counts each payment tab, and totals what is shown without cancelled ones', async () => {
    const shop = await makeShop();
    await makeOrder(shop.id, { status: 'PAID', totalKes: 3000, firstName: 'Zed' });
    await makeOrder(shop.id, { status: 'PENDING', totalKes: 1000, firstName: 'Amy' });
    await makeOrder(shop.id, { status: 'CANCELLED', totalKes: 9000, firstName: 'Bob' });

    const all = await orders.list(shop.id, { sort: 'total_desc' });
    expect(all.orders.map((o) => o.totalKes.toString())).toEqual(['9000', '3000', '1000']);
    expect(all.counts).toMatchObject({ all: 3, PAID: 1, PENDING: 1, CANCELLED: 1 });
    expect(all.shownTotalKes).toBe(4000);
    expect((await orders.list(shop.id, { sort: 'customer' })).orders.map((o) => o.firstName)).toEqual(['Amy', 'Bob', 'Zed']);

    // A tab filters the list but the tabs' counts still show every tab.
    const paid = await orders.list(shop.id, { status: 'PAID' });
    expect(paid.total).toBe(1);
    expect(paid.counts.all).toBe(3);
  });

  it('searches leads by name, phone or product, counts each status, and keeps shops apart', async () => {
    const shop = await makeShop();
    const other = await makeShop();
    await prisma.cartLead.create({ data: { shopId: shop.id, source: 'ABANDONED_CART', customerName: 'Wanjiru', customerPhone: '0722000111', lines: { create: [{ name: 'Black boots', size: '42', quantity: 1, priceKes: 100 }] } } });
    await prisma.cartLead.create({ data: { shopId: shop.id, source: 'WHATSAPP_ORDER', status: 'CONTACTED', customerName: 'Otieno', lines: { create: [{ name: 'Loafers', size: '43', quantity: 1, priceKes: 100 }] } } });
    await prisma.cartLead.create({ data: { shopId: other.id, source: 'WHATSAPP_ORDER', customerName: 'Wanjiru', lines: { create: [{ name: 'Black boots', size: '42', quantity: 1, priceKes: 100 }] } } });

    expect((await leads.list(shop.id, { search: 'wanj' })).total).toBe(1);
    expect((await leads.list(shop.id, { search: 'loafers' })).total).toBe(1);
    expect((await leads.list(shop.id, { search: '0722000111' })).total).toBe(1);
    const r = await leads.list(shop.id, { status: 'NEW' });
    expect(r.total).toBe(1);
    expect(r.counts).toMatchObject({ all: 2, NEW: 1, CONTACTED: 1 });
    expect((await leads.list(shop.id, { source: 'WHATSAPP_ORDER' })).total).toBe(1);
  });
});

describe('the analytics overview and the dashboard list', () => {
  it('compares with the period before, fills the gaps, counts a Nairobi day, and keeps shops apart', async () => {
    const shop = await makeShop();
    const other = await makeShop();
    const variant = await makeVariant(shop.id, 1000, 50, 'Seller');
    const now = Date.now();
    const at = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000);
    const sell = (hoursAgo: number, total: number, status = 'PAID', source = 'WEBSITE') =>
      makeOrder(shop.id, { status, source, totalKes: total, createdAt: at(hoursAgo), lines: { create: [{ variantId: variant.id, quantity: 2, priceKes: total / 2 }] } });
    await sell(30, 4000); await sell(50, 2000, 'PENDING', 'WHATSAPP'); await sell(40, 999, 'CANCELLED');
    // In the period before (days 4-6 back of a 3-day window): one order.
    await sell(24 * 5, 1000);
    await makeOrder(other.id, { status: 'PAID', totalKes: 777777 });
    await prisma.storefrontEvent.createMany({ data: [
      { shopId: shop.id, sessionId: 's1', type: 'SESSION_START' }, { shopId: shop.id, sessionId: 's2', type: 'SESSION_START' },
      { shopId: shop.id, sessionId: 's1', type: 'VIEW_PRODUCT', productSlug: 'x' }, { shopId: shop.id, sessionId: 's1', type: 'WHATSAPP_CLICK' },
    ] });

    const from = at(24 * 3); const to = new Date(Date.now() + 60_000);
    const o = await overview.overview(shop.id, from, to);
    expect(o.current).toMatchObject({ orders: 2, soldKes: 6000, paidKes: 4000, cancelled: 1, units: 4, visits: 2, whatsappTaps: 1 });
    expect(o.current.conversion).toBe(1);
    expect(o.previous).toMatchObject({ orders: 1, soldKes: 1000 });
    expect(o.change.soldKes).toBeCloseTo(5);
    expect(o.series.length).toBeGreaterThanOrEqual(3);
    expect(o.series.reduce((n, r) => n + r.orders, 0)).toBe(2);
    expect(o.bySource.map((s) => s.source).sort()).toEqual(['WEBSITE', 'WHATSAPP']);
    expect(o.topProducts[0]).toMatchObject({ name: 'Seller', units: 4, revenueKes: 6000 });
    expect(o.byHour).toHaveLength(24);
    expect(o.byWeekday.reduce((n, r) => n + r.orders, 0)).toBe(2);
    // The other shop's 777,777 is nowhere in it.
    expect(JSON.stringify(o)).not.toContain('777777');
  });

  it('says what needs a person, with no takings in it', async () => {
    const shop = await makeShop();
    await makeVariant(shop.id, 100, 0, 'Sold out');
    await makeVariant(shop.id, 100, 2, 'Low');
    await makeVariant(shop.id, 100, 30, 'Fine');
    await makeOrder(shop.id, { status: 'PENDING', createdAt: new Date(Date.now() - 72 * 3600_000), totalKes: 1234 });
    await makeOrder(shop.id, { status: 'PENDING', totalKes: 50 });
    const a = await overview.attention(shop.id);
    expect(a).toMatchObject({ soldOut: 1, lowStock: 1, noPhoto: 3, toShip: 2 });
    expect(a.unpaidOver2Days).toEqual({ orders: 1, amountKes: 1234 });
    expect(a.lowStockProducts.map((p) => p.name)).toEqual(['Low']);
  });
});

describe('sharing, against the real database', () => {
  it('lists only shown, in-stock products with tagged links, and refuses a link that leaves the shop', async () => {
    const shop = await makeShop({ customDomain: 'gents.test' });
    const ok = await makeVariant(shop.id, 3500, 4, 'Black boots');
    await makeVariant(shop.id, 100, 0, 'Sold out boots');
    const hidden = await makeVariant(shop.id, 100, 5, 'Hidden boots');
    await prisma.product.update({ where: { id: hidden.productId }, data: { isActive: false } });

    const r = await share.search(shop.id, { q: 'boots' });
    expect(r.items.map((i) => i.name)).toEqual(['Black boots']);
    const channels = r.items[0].channels as any;
    expect(channels.whatsapp.link).toContain('https://gents.test/shop/');
    expect(channels.whatsapp.link).toContain('utm_source=whatsapp');
    expect(channels.whatsapp.href).toContain('https://wa.me/?text=');
    expect(r.items[0].priceText).toBe('KES 3,500');

    await expect(share.buildLink(shop.id, { target: 'path', path: '//evil.test' })).rejects.toThrow();
    const product = await prisma.product.findFirstOrThrow({ where: { id: ok.productId } });
    const link = await share.buildLink(shop.id, { target: 'product', slug: product.slug, source: 'Instagram Bio', campaign: 'Nov Sale' });
    expect(link.url).toContain(`/shop/${product.slug}?utm_source=instagram-bio&utm_medium=social&utm_campaign=nov-sale`);
    await expect(share.buildLink(shop.id, { target: 'product', slug: 'nope' })).rejects.toThrow();
  });

  it('builds a catalogue message from this shop\'s products only, and counts shares once per tap', async () => {
    const shop = await makeShop();
    const other = await makeShop();
    const a = await makeVariant(shop.id, 1000, 3, 'Alpha');
    const b = await makeVariant(other.id, 1000, 3, 'Foreign');
    const c = await share.catalogue(shop.id, [a.productId, b.productId]);
    expect(c.count).toBe(1);
    expect(c.dropped).toBe(1);
    expect(c.message).toContain('Alpha');
    expect(c.message).not.toContain('Foreign');
    await expect(share.catalogue(shop.id, [])).rejects.toThrow();

    expect(await share.record(shop.id, 'a@shop.test', { channel: 'whatsapp', kind: 'PRODUCT', productSlug: 'alpha' })).toEqual({ recorded: true });
    expect(await share.record(shop.id, 'a@shop.test', { channel: 'whatsapp', kind: 'PRODUCT', productSlug: 'alpha' })).toEqual({ recorded: false });
    await expect(share.record(shop.id, 'a@shop.test', { channel: 'myspace', kind: 'PRODUCT' })).rejects.toThrow();
    const stats = await share.stats(shop.id, 7);
    expect(stats).toMatchObject({ total: 1, people: 1 });
    expect((await share.stats(other.id, 7)).total).toBe(0);
  });
});
