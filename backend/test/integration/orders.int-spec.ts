import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CheckoutService } from '../../src/checkout/checkout.service';
import { PortalOrderService } from '../../src/portal-order/portal-order.service';
import { PortalDiscountService } from '../../src/portal-discount/portal-discount.service';
import { cleanup, close, makeShop, makeVariant, prisma } from './helpers';

const email = { send: jest.fn(async () => true) };
const notifications = { newOrder: jest.fn(async () => undefined) };
const checkout = new CheckoutService(prisma, null as any, new PortalDiscountService(prisma), email as any, notifications as any);
const orders = new PortalOrderService(prisma, checkout);

const owner = { id: 'u-owner', firstName: 'Own', lastName: 'Er', role: 'OWNER' };
const cashier = { id: 'u-cash', firstName: 'Cash', lastName: 'Ier', role: 'STAFF' };
const stockOf = async (variantId: string) => (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockOnHand;
const baseOrder = { firstName: 'Amina', source: 'WHATSAPP' as const };

beforeEach(() => { email.send.mockClear(); notifications.newOrder.mockClear(); });
afterAll(async () => { await cleanup(); await close(); });

describe('storefront checkout: what the customer is charged', () => {
  const dto = (variantId: string, quantity: number, extra: any = {}) => ({ lines: [{ variantId, quantity }], firstName: 'A', lastName: 'B', ...extra });

  it('prices lines from the catalogue and adds the flat delivery fee below the threshold', async () => {
    const shop = await makeShop({ deliveryFeeKes: 300, freeDeliveryOverKes: 5000 });
    const v = await makeVariant(shop.id, 1200);
    const { order, online } = await checkout.start(shop.id, dto(v.id, 2) as any, null);
    expect(online).toBe(false);
    expect(Number(order.subtotalKes)).toBe(2400);
    expect(Number(order.shippingKes)).toBe(300);
    expect(Number(order.totalKes)).toBe(2700);
  });

  it('waives delivery once the order reaches the free-delivery amount', async () => {
    const shop = await makeShop({ deliveryFeeKes: 300, freeDeliveryOverKes: 5000 });
    const v = await makeVariant(shop.id, 2500);
    const { order } = await checkout.start(shop.id, dto(v.id, 2) as any, null);
    expect(Number(order.shippingKes)).toBe(0);
    expect(Number(order.totalKes)).toBe(5000);
  });

  it('judges free delivery after the discount, so a discount can bring the fee back', async () => {
    const shop = await makeShop({ deliveryFeeKes: 300, freeDeliveryOverKes: 5000 });
    const v = await makeVariant(shop.id, 5000);
    await prisma.discount.create({ data: { shopId: shop.id, code: 'TENOFF', type: 'PERCENT', percentOff: 10 } });
    const { order } = await checkout.start(shop.id, dto(v.id, 1, { discountCode: 'tenoff' }) as any, null);
    expect(Number(order.discountKes)).toBe(500);
    expect(Number(order.shippingKes)).toBe(300);   // 4500 is under 5000
    expect(Number(order.totalKes)).toBe(4800);
  });

  it('caps a fixed discount at the subtotal and never goes negative', async () => {
    const shop = await makeShop();
    const v = await makeVariant(shop.id, 400);
    await prisma.discount.create({ data: { shopId: shop.id, code: 'BIG', type: 'FIXED_AMOUNT', amountOffKes: 1000 } });
    const { order } = await checkout.start(shop.id, dto(v.id, 1, { discountCode: 'BIG' }) as any, null);
    expect(Number(order.discountKes)).toBe(400);
    expect(Number(order.totalKes)).toBe(0);
  });

  it('rejects an expired, inactive or unknown code instead of silently charging full price', async () => {
    const shop = await makeShop();
    const v = await makeVariant(shop.id, 1000);
    await prisma.discount.create({ data: { shopId: shop.id, code: 'OLD', type: 'PERCENT', percentOff: 50, expiresAt: new Date(Date.now() - 1000) } });
    await prisma.discount.create({ data: { shopId: shop.id, code: 'OFF', type: 'PERCENT', percentOff: 50, isActive: false } });
    for (const code of ['OLD', 'OFF', 'NOPE']) {
      await expect(checkout.start(shop.id, dto(v.id, 1, { discountCode: code }) as any, null)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it("will not sell another shop's item", async () => {
    const mine = await makeShop(); const theirs = await makeShop();
    const theirVariant = await makeVariant(theirs.id, 100);
    await expect(checkout.start(mine.id, dto(theirVariant.id, 1) as any, null)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not touch stock until payment is confirmed', async () => {
    const shop = await makeShop();
    const v = await makeVariant(shop.id, 1000, 5);
    await checkout.start(shop.id, dto(v.id, 2) as any, null);
    expect(await stockOf(v.id)).toBe(5);
  });
});

describe('manual orders (WhatsApp / walk-in)', () => {
  it("builds totals from the catalogue and merges the same item listed twice", async () => {
    const shop = await makeShop();
    const v = await makeVariant(shop.id, 1500);
    const o = await orders.create(shop.id, cashier, { ...baseOrder, lines: [{ variantId: v.id, quantity: 1 }, { variantId: v.id, quantity: 2 }], shippingKes: 200 } as any);
    expect(o.lines).toHaveLength(1);
    expect(o.lines[0].quantity).toBe(3);
    expect(Number(o.subtotalKes)).toBe(4500);
    expect(Number(o.totalKes)).toBe(4700);
    expect(o.status).toBe('PENDING');
  });

  it('applies an owner discount, capped at the subtotal', async () => {
    const shop = await makeShop();
    const v = await makeVariant(shop.id, 1000);
    const o = await orders.create(shop.id, owner, { ...baseOrder, lines: [{ variantId: v.id, quantity: 1 }], discountKes: 250, shippingKes: 100 } as any);
    expect(Number(o.totalKes)).toBe(850);
    const capped = await orders.create(shop.id, owner, { ...baseOrder, lines: [{ variantId: v.id, quantity: 1 }], discountKes: 99999 } as any);
    expect(Number(capped.discountKes)).toBe(1000);
    expect(Number(capped.totalKes)).toBe(0);
  });

  it('does not let a cashier give a discount', async () => {
    const shop = await makeShop();
    const v = await makeVariant(shop.id, 1000);
    await expect(orders.create(shop.id, cashier, { ...baseOrder, lines: [{ variantId: v.id, quantity: 1 }], discountKes: 100 } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects items from another shop and marking paid without a payment method", async () => {
    const mine = await makeShop(); const theirs = await makeShop();
    const mineV = await makeVariant(mine.id, 100); const theirV = await makeVariant(theirs.id, 100);
    await expect(orders.create(mine.id, owner, { ...baseOrder, lines: [{ variantId: theirV.id, quantity: 1 }] } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(orders.create(mine.id, owner, { ...baseOrder, lines: [{ variantId: mineV.id, quantity: 1 }], markPaid: true } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('takes stock out exactly once when paid, however many times it is marked paid', async () => {
    const shop = await makeShop();
    const v = await makeVariant(shop.id, 1000, 10);
    const o = await orders.create(shop.id, owner, { ...baseOrder, lines: [{ variantId: v.id, quantity: 3 }], markPaid: true, paymentMethod: 'CASH' } as any);
    expect(o.status).toBe('PAID');
    expect(o.paymentMethod).toBe('CASH');
    expect(await stockOf(v.id)).toBe(7);
    await orders.setStatus(shop.id, o.id, 'PAID', { method: 'CASH' });
    await checkout.markPaid(o.id, { method: 'MPESA' });
    expect(await stockOf(v.id)).toBe(7);
  });

  it('puts the stock back when a paid order is cancelled, but not for an unpaid one', async () => {
    const shop = await makeShop();
    const v = await makeVariant(shop.id, 1000, 10);
    const paid = await orders.create(shop.id, owner, { ...baseOrder, lines: [{ variantId: v.id, quantity: 4 }], markPaid: true, paymentMethod: 'CASH' } as any);
    expect(await stockOf(v.id)).toBe(6);
    await orders.setStatus(shop.id, paid.id, 'CANCELLED');
    expect(await stockOf(v.id)).toBe(10);

    const unpaid = await orders.create(shop.id, owner, { ...baseOrder, lines: [{ variantId: v.id, quantity: 4 }] } as any);
    await orders.setStatus(shop.id, unpaid.id, 'CANCELLED');
    expect(await stockOf(v.id)).toBe(10);
  });

  it("will not touch another shop's order", async () => {
    const mine = await makeShop(); const theirs = await makeShop();
    const v = await makeVariant(theirs.id, 100);
    const theirOrder = await orders.create(theirs.id, owner, { ...baseOrder, lines: [{ variantId: v.id, quantity: 1 }] } as any);
    await expect(orders.setStatus(mine.id, theirOrder.id, 'PAID')).rejects.toBeInstanceOf(NotFoundException);
    await expect(orders.get(mine.id, theirOrder.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('credits a support session\'s notes to "platform support"', async () => {
    const shop = await makeShop();
    const v = await makeVariant(shop.id, 100);
    const o = await orders.create(shop.id, owner, { ...baseOrder, lines: [{ variantId: v.id, quantity: 1 }] } as any);
    const note = await orders.addNote(shop.id, o.id, { firstName: 'Own', lastName: 'Er', impersonatedBy: 'admin1' } as any, 'checked stock');
    expect(note.authorName).toBe('Own Er (platform support)');
    const normal = await orders.addNote(shop.id, o.id, { firstName: 'Own', lastName: 'Er' } as any, 'ok');
    expect(normal.authorName).toBe('Own Er');
  });
});
