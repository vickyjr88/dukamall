import { FunnelService } from '../../src/portal-analytics/funnel.service';
import { StorefrontEventsService } from '../../src/storefront-events/storefront-events.service';
import { cleanup, close, makeOrder, makeShop, makeVariant, prisma } from './helpers';

const funnel = new FunnelService(prisma);
const events = new StorefrontEventsService(prisma);
const phone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1', originHost: 'shop.test' };
const desktop = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120', originHost: 'shop.test' };

afterAll(async () => {
  await prisma.storefrontEvent.deleteMany({ where: { shop: { slug: { startsWith: 'it-' } } } });
  await cleanup();
  await close();
});

const window = () => ({ from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 3600_000) });

describe('the visits-to-orders funnel, against the real database', () => {
  it('follows each visit from where it came from to the order, and keeps shops apart', async () => {
    const shop = await makeShop();
    const other = await makeShop();
    const variant = await makeVariant(shop.id, 4200, 5, 'Puma Roma');
    const product = await prisma.product.findFirstOrThrow({ where: { id: variant.productId } });

    // Visit A: a Facebook ad on a phone. Views, adds to cart, checks out, pays online.
    await events.record(shop.id, { sessionId: 'aaaaaaaaaaaa01', events: [{ type: 'SESSION_START', utmSource: 'facebook', utmMedium: 'cpc', utmCampaign: 'roma' }, { type: 'VIEW_PRODUCT', productSlug: product.slug }, { type: 'ADD_TO_CART', productSlug: product.slug }, { type: 'BEGIN_CHECKOUT' }] }, phone);
    await makeOrder(shop.id, { sessionId: 'aaaaaaaaaaaa01', totalKes: 4200 });

    // Visit B: a TikTok ad, views and taps WhatsApp; the shop turns the WhatsApp lead into an order by hand.
    await events.record(shop.id, { sessionId: 'bbbbbbbbbbbb02', events: [{ type: 'SESSION_START', utmSource: 'tiktok' }, { type: 'VIEW_PRODUCT', productSlug: product.slug }, { type: 'WHATSAPP_CLICK', productSlug: product.slug, detail: 'product-page' }] }, phone);
    const converted = await makeOrder(shop.id, { totalKes: 3800 }); // no session of its own
    await prisma.cartLead.create({ data: { shopId: shop.id, source: 'WHATSAPP_ORDER', sessionId: 'bbbbbbbbbbbb02', convertedOrderId: converted.id, status: 'CONVERTED' } });

    // Visit C: direct on a desktop, views one product and leaves.
    await events.record(shop.id, { sessionId: 'cccccccccccc03', events: [{ type: 'SESSION_START' }, { type: 'VIEW_PRODUCT', productSlug: product.slug }, { type: 'SEARCH', detail: 'Air Max' }] }, desktop);

    // A cancelled order never counts, and an order with no visit shows only in the period total.
    await makeOrder(shop.id, { sessionId: 'cccccccccccc03', totalKes: 999, status: 'CANCELLED' });
    await makeOrder(shop.id, { totalKes: 1000 });

    // Another shop's traffic must not leak in.
    await events.record(other.id, { sessionId: 'dddddddddddd04', events: [{ type: 'SESSION_START', utmSource: 'facebook' }] }, phone);

    const result = await funnel.funnel(shop.id, window().from, window().to);
    expect(result.totals).toMatchObject({ sessions: 3, viewedProduct: 3, addedToCart: 1, beganCheckout: 1, tappedWhatsapp: 1, whatsappOrders: 1, orders: 2, revenueKes: 8000 });

    const fb = result.bySource.find((s) => s.source === 'Facebook')!;
    expect(fb).toMatchObject({ medium: 'cpc', sessions: 1, orders: 1, revenueKes: 4200 });
    const tt = result.bySource.find((s) => s.source === 'TikTok')!;
    expect(tt).toMatchObject({ sessions: 1, tappedWhatsapp: 1, whatsappOrders: 1, orders: 1, revenueKes: 3800 });
    expect(result.bySource.find((s) => s.source === 'Direct')).toMatchObject({ sessions: 1, orders: 0 });

    expect(result.byDevice.find((d) => d.device === 'mobile')!.sessions).toBe(2);
    expect(result.byDevice.find((d) => d.device === 'desktop')!.sessions).toBe(1);

    expect(result.products[0]).toMatchObject({ slug: product.slug, name: 'Puma Roma', views: 3, addedToCart: 1, tappedWhatsapp: 1, inStock: true });
    expect(result.searches).toEqual([{ term: 'air max', searches: 1 }]);
    // Three non-cancelled orders in the period, two of them traced to a visit.
    expect(result.orders).toMatchObject({ placed: 3, linkedToVisits: 2 });
  });

  it('records a session start only once, however often the browser repeats it', async () => {
    const shop = await makeShop();
    const start = { sessionId: 'eeeeeeeeeeee05', events: [{ type: 'SESSION_START', utmSource: 'facebook' }] };
    await events.record(shop.id, start, phone);
    await events.record(shop.id, start, phone);
    expect(await prisma.storefrontEvent.count({ where: { shopId: shop.id, type: 'SESSION_START' } })).toBe(1);
  });

  it('counts a visit once even if two starts raced in together', async () => {
    const shop = await makeShop();
    const row = { shopId: shop.id, sessionId: 'ffffffffffff06', type: 'SESSION_START', source: 'Facebook', medium: 'paid', device: 'mobile' };
    await prisma.storefrontEvent.createMany({ data: [row, row] });
    await prisma.storefrontEvent.create({ data: { shopId: shop.id, sessionId: 'ffffffffffff06', type: 'VIEW_PRODUCT', productSlug: 'x' } });
    const result = await funnel.funnel(shop.id, window().from, window().to);
    expect(result.totals).toMatchObject({ sessions: 1, viewedProduct: 1 });
    expect(result.bySource).toHaveLength(1);
  });

  it('an empty shop returns zeros, not errors', async () => {
    const shop = await makeShop();
    const result = await funnel.funnel(shop.id, window().from, window().to);
    expect(result.totals.sessions).toBe(0);
    expect(result.bySource).toEqual([]);
    expect(result.orders).toMatchObject({ placed: 0, linkedToVisits: 0 });
  });
});
