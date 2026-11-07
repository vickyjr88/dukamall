import { CartLeadService } from '../../src/cart-lead/cart-lead.service';
import { CheckoutService } from '../../src/checkout/checkout.service';
import { PortalDiscountService } from '../../src/portal-discount/portal-discount.service';
import { PortalOrderService } from '../../src/portal-order/portal-order.service';
import { cleanup, close, makeOrder, makeShop, makeVariant, prisma } from './helpers';

const notifications = { newOrder: jest.fn(async () => undefined) };
const email = { send: jest.fn(async () => true) };
const leads = new CartLeadService(prisma, notifications as any);
const checkout = new CheckoutService(prisma, null as any, new PortalDiscountService(prisma), email as any, notifications as any);
const orders = new PortalOrderService(prisma, checkout);

afterAll(async () => { await cleanup(); await close(); });

describe('WhatsApp follow-ups, against the real database', () => {
  it('a lead carries a message in its own shop\'s name, linking each product on its own storefront, and another shop never sees it', async () => {
    const shop = await makeShop({ name: 'Phone Hub', customDomain: 'phonehub.test' });
    const other = await makeShop({ name: 'Other Shop' });
    const variant = await makeVariant(shop.id, 78000, 5, 'iPhone 13');
    const product = await prisma.product.findFirstOrThrow({ where: { id: variant.productId } });
    const lead = await prisma.cartLead.create({
      data: {
        shopId: shop.id, source: 'ABANDONED_CART', customerName: 'Wanjiru Kamau', customerPhone: '0722111222',
        lines: { create: [{ variantId: variant.id, name: 'iPhone 13', size: '128GB', quantity: 1, priceKes: 78000 }, { name: 'Typed size', size: '47', quantity: 1, priceKes: 500, isCustomSize: true }] },
      },
    });

    const list = await leads.list(shop.id);
    const row = list.leads.find((l) => l.id === lead.id)!;
    expect(row.followUp!.phone).toBe('254722111222');
    expect(row.followUp!.message).toContain("Hi Wanjiru, it's Phone Hub.");
    expect(row.followUp!.message).toContain(`https://phonehub.test/shop/${product.slug}?utm_source=whatsapp&utm_medium=followup&utm_campaign=abandoned-cart`);
    expect(row.followUp!.message).toContain('Total: KES 78,500');
    // The line typed by hand has no page, so exactly one link.
    expect(row.followUp!.message.match(/https:\/\//g)).toHaveLength(1);

    const one = await leads.get(shop.id, lead.id);
    expect(one.followUp!.message).toBe(row.followUp!.message);
    expect((await leads.list(other.id)).leads).toHaveLength(0);

    await prisma.cartLead.update({ where: { id: lead.id }, data: { status: 'CONVERTED' } });
    expect((await leads.get(shop.id, lead.id)).followUp).toBeNull();
  });

  it('an order is worded by payment and delivery, and a cancelled one has none', async () => {
    const shop = await makeShop({ name: 'Phone Hub' });
    const variant = await makeVariant(shop.id, 4200, 5, 'Puma Roma');
    const mk = (over: any) => makeOrder(shop.id, { phone: '0733444555', firstName: 'Brian', totalKes: 4200, subtotalKes: 4200, lines: { create: [{ variantId: variant.id, quantity: 1, priceKes: 4200 }] }, ...over });
    const unpaid = await mk({});
    const shipped = await mk({ status: 'PAID', fulfilmentStatus: 'SHIPPED' });
    const cancelled = await mk({ status: 'CANCELLED' });

    const a = await orders.get(shop.id, unpaid.id);
    expect(a.followUp!.message).toContain(`Thank you for your order ${unpaid.orderNumber}`);
    expect(a.followUp!.message).toContain('Balance to pay: KES 4,200.');
    expect(a.followUp!.message).toContain('1. Puma Roma - 42 (x1): KES 4,200');
    expect((await orders.get(shop.id, shipped.id)).followUp!.message).toContain('is on its way');
    expect((await orders.get(shop.id, cancelled.id)).followUp).toBeNull();

    const listed = await orders.list(shop.id, {} as any);
    expect(listed.orders.find((o) => o.id === unpaid.id)!.followUp).not.toBeNull();
    expect(listed.orders.find((o) => o.id === cancelled.id)!.followUp).toBeNull();
  });
});
