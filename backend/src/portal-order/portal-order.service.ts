import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FulfilmentStatus, OrderSource, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutService } from '../checkout/checkout.service';
import { nextOrderNumber } from '../common/order-helpers';
import { buildFollowUp, FollowUp, followUpStatus, productPath } from '../common/follow-up';
import { storefrontOriginForShop } from '../common/storefront-origin';
import type { CreateManualOrderDto } from './portal-order.controller';

export type PortalOrderListQuery = {
  status?: OrderStatus;
  fulfilment?: FulfilmentStatus;
  source?: OrderSource;
  search?: string;
  from?: Date;
  to?: Date;
  sort?: string;
  page?: number;
  pageSize?: number;
};

/** What the orders list can be sorted by. Anything else is newest first; ties always fall back to newest so pages do not shuffle. */
export function orderSortBy(sort?: string): Prisma.OrderOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest': return [{ createdAt: 'asc' }];
    case 'total_desc': return [{ totalKes: 'desc' }, { createdAt: 'desc' }];
    case 'total_asc': return [{ totalKes: 'asc' }, { createdAt: 'desc' }];
    case 'customer': return [{ firstName: 'asc' }, { lastName: 'asc' }, { createdAt: 'desc' }];
    case 'number': return [{ orderNumber: 'desc' }];
    default: return [{ createdAt: 'desc' }];
  }
}

/** Who a note is credited to; a platform-support session says so rather than posing as the owner. */
type OrderForFollowUp = {
  orderNumber: string; status: string; fulfilmentStatus: string; firstName: string; phone: string | null; totalKes: unknown;
  lines: Array<{ quantity: number; priceKes: unknown; variant: { name: string; product: { slug: string } } }>;
};

/** The WhatsApp follow-up for an order: its items with a link to each product, worded for where the order has got to. */
export function orderFollowUp(order: OrderForFollowUp, shop: { name: string; currency: string }, origin: string): FollowUp | null {
  const status = followUpStatus(order);
  return buildFollowUp({
    kind: 'ORDER',
    shopName: shop.name, currency: shop.currency, name: order.firstName, phone: order.phone,
    lines: order.lines.map((l) => ({ name: l.variant.name, quantity: l.quantity, unitPrice: Number(l.priceKes), path: productPath(l.variant.product) })),
    total: Number(order.totalKes),
    orderNumber: order.orderNumber,
    orderStatus: status,
    // An order is unpaid or paid in full: this platform records no part payments.
    balance: status === 'PENDING' ? Number(order.totalKes) : 0,
    origin,
  });
}

function authorLabel(user: { firstName: string; lastName: string; impersonatedBy?: string | null }): string {
  const name = `${user.firstName} ${user.lastName}`.trim() || 'Staff';
  return user.impersonatedBy ? `${name} (platform support)` : name;
}

@Injectable()
export class PortalOrderService {
  constructor(private prisma: PrismaService, private checkout: CheckoutService) {}

  // Same search/pagination shape as PortalProductService.list -- a shop with
  // a real order history (msa already has enough to matter) needs to find
  // "that order from last week" without scrolling an unbounded table.
  // Search matches order number or customer name/phone/email; unlike the
  // product search this has no fuzzy fallback, since order numbers and
  // phone numbers are exact-match lookups by nature, not typo-prone browsing.
  private buildWhere(shopId: string, query: PortalOrderListQuery): Prisma.OrderWhereInput {
    return {
      shopId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.fulfilment ? { fulfilmentStatus: query.fulfilment } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  /** The filtered orders as flat rows for a spreadsheet: one row per order (capped, newest first). */
  async exportRows(shopId: string, query: PortalOrderListQuery) {
    const orders = await this.prisma.order.findMany({
      where: this.buildWhere(shopId, query),
      include: { lines: { include: { variant: { include: { product: true } } } }, discount: { select: { code: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20000,
    });
    return orders.map((o) => ({
      orderNumber: o.orderNumber,
      date: o.createdAt.toISOString(),
      status: o.status,
      delivery: o.status === 'CANCELLED' ? '' : o.fulfilmentStatus,
      source: o.source,
      firstName: o.firstName,
      lastName: o.lastName,
      phone: o.phone ?? '',
      email: o.email ?? '',
      shippingAddress: o.shippingAddress ?? '',
      items: o.lines.map((l) => `${l.quantity} x ${l.variant.product.name} (${l.variant.size ?? l.variant.name})`).join('; '),
      subtotalKes: Number(o.subtotalKes),
      discountKes: Number(o.discountKes ?? 0),
      shippingKes: Number(o.shippingKes ?? 0),
      totalKes: Number(o.totalKes),
      discountCode: o.discount?.code ?? '',
      paymentMethod: o.paymentMethod ?? (o.paystackReference ? 'PAYSTACK' : ''),
      paymentReference: o.paymentReference ?? o.paystackReference ?? '',
      trackingNote: o.trackingNote ?? '',
    }));
  }

  async list(shopId: string, query: PortalOrderListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));

    const where = this.buildWhere(shopId, query);
    // The tabs' counts and the money line follow every filter except the payment tab itself, so each tab says what it would show.
    const { status: _tab, ...withoutTab } = query;
    const tabWhere = this.buildWhere(shopId, withoutTab);

    const [orders, total, byStatus, toShip, shown] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { lines: { include: { variant: { include: { product: true } } } } },
        orderBy: orderSortBy(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.groupBy({ by: ['status'], where: tabWhere, _count: { _all: true } }),
      this.prisma.order.count({ where: { ...tabWhere, status: { not: 'CANCELLED' }, fulfilmentStatus: 'UNFULFILLED' } }),
      this.prisma.order.aggregate({ where: { ...where, status: { not: 'CANCELLED' } }, _sum: { totalKes: true } }),
    ]);

    const count = (status: string) => byStatus.find((r) => r.status === status)?._count._all ?? 0;
    const counts = { all: byStatus.reduce((n, r) => n + r._count._all, 0), PENDING: count('PENDING'), PAID: count('PAID'), CANCELLED: count('CANCELLED'), toShip };

    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    const origin = storefrontOriginForShop(shop);
    return {
      orders: orders.map((order) => ({ ...order, followUp: orderFollowUp(order, shop, origin) })),
      total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), counts,
      // What the orders on show add up to, not counting cancelled ones.
      shownTotalKes: Number(shown._sum.totalKes ?? 0),
    };
  }

  async get(shopId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, shopId },
      include: {
        lines: { include: { variant: { include: { product: true } } } },
        notes: { orderBy: { createdAt: 'desc' } },
        discount: { select: { code: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    return { ...order, followUp: orderFollowUp(order, shop, storefrontOriginForShop(shop)) };
  }

  async setStatus(shopId: string, orderId: string, status: OrderStatus, payment: { method?: PaymentMethod; reference?: string } = {}) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, shopId } });
    if (!order) throw new NotFoundException('Order not found');

    // A merchant marking a cash/WhatsApp order PAID by hand is the same
    // transition an online payment makes automatically -- routed through
    // CheckoutService.markPaid so stock is decremented and the order
    // confirmation email goes out exactly once, the same as the Paystack
    // verify/webhook paths. Before this, a staff-marked PAID order never
    // decremented stock at all (a real, independent bug this fix also
    // closes, not just an email gap).
    if (order.status === 'PENDING' && status === 'PAID') {
      // How it was paid is recorded; defaulting to OTHER keeps older callers
      // that send only a status working.
      await this.checkout.markPaid(orderId, { method: payment.method ?? 'OTHER', reference: payment.reference });
      return this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    }

    // Cancelling an order that already decremented stock (see
    // CheckoutService.markPaid -- stock is only decremented on confirmed
    // payment, not at checkout start) should return that stock, since the
    // shop can now sell it again. Only do this on the PAID -> CANCELLED
    // transition specifically -- a PENDING order never touched stock in the
    // first place, so reversing it there would incorrectly inflate
    // stockOnHand.
    if (order.status === 'PAID' && status === 'CANCELLED') {
      const lines = await this.prisma.orderLine.findMany({ where: { orderId } });
      await this.prisma.$transaction([
        this.prisma.order.update({ where: { id: orderId }, data: { status } }),
        ...lines.map((line) =>
          this.prisma.productVariant.update({
            where: { id: line.variantId },
            data: { stockOnHand: { increment: line.quantity } },
          }),
        ),
      ]);
      return this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    }

    return this.prisma.order.update({ where: { id: orderId }, data: { status } });
  }

  /**
   * Records a sale made outside the website. The order is built exactly as a
   * checkout builds one -- prices come from the variants, never the caller --
   * and, when it is already paid, goes through CheckoutService.markPaid so
   * stock is decremented and the customer's confirmation is sent by the same
   * code that handles an online payment.
   */
  async create(shopId: string, user: { id: string; firstName: string; lastName: string; role: string }, dto: CreateManualOrderDto) {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });

    if (dto.discountKes && dto.discountKes > 0 && user.role !== 'OWNER') {
      throw new ForbiddenException('Only the shop owner can give a manual discount.');
    }
    if (dto.markPaid && !dto.paymentMethod) {
      throw new BadRequestException('Choose how it was paid.');
    }

    // The same line can't appear twice; merge instead of failing.
    const wanted = new Map<string, number>();
    for (const line of dto.lines) wanted.set(line.variantId, (wanted.get(line.variantId) ?? 0) + line.quantity);

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: Array.from(wanted.keys()) }, product: { shopId } },
      include: { product: { select: { costKes: true } } },
    });
    if (variants.length !== wanted.size) throw new BadRequestException('One or more of those items no longer exists.');

    let subtotal = 0;
    const lines = variants.map((variant) => {
      const quantity = wanted.get(variant.id)!;
      const price = Number(variant.priceKes);
      subtotal += price * quantity;
      return { variantId: variant.id, quantity, priceKes: price, unitCostKes: variant.product.costKes };
    });

    const discountKes = Math.min(dto.discountKes ?? 0, subtotal);
    const shippingKes = dto.shippingKes ?? 0;
    const total = subtotal - discountKes + shippingKes;

    if (dto.leadId) {
      const lead = await this.prisma.cartLead.findFirst({ where: { id: dto.leadId, shopId } });
      if (!lead) throw new BadRequestException('That lead no longer exists.');
      if (lead.status === 'CONVERTED') throw new BadRequestException('An order has already been created from that lead.');
    }

    // Link to an existing customer account when the contact details match one,
    // so the sale shows in their history and lifetime value. Never creates one:
    // guests stay guests, exactly as they do at checkout.
    const contactMatch = [
      ...(dto.email ? [{ email: dto.email }] : []),
      ...(dto.phone ? [{ phone: dto.phone }] : []),
    ];
    const customer = contactMatch.length
      ? await this.prisma.customer.findFirst({ where: { shopId, OR: contactMatch }, select: { id: true } })
      : null;

    const authorName = authorLabel(user);

    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx, shopId, shop.orderPrefix);
      const created = await tx.order.create({
        data: {
          shopId,
          customerId: customer?.id,
          orderNumber,
          firstName: dto.firstName.trim(),
          lastName: (dto.lastName ?? '').trim(),
          email: dto.email || null,
          phone: dto.phone?.trim() || null,
          shippingAddress: dto.shippingAddress?.trim() || null,
          subtotalKes: subtotal,
          discountKes,
          shippingKes,
          totalKes: total,
          source: dto.source,
          createdByUserId: user.id,
          lines: { create: lines },
          ...(dto.note?.trim() ? { notes: { create: { authorName, text: dto.note.trim() } } } : {}),
        },
      });
      if (dto.leadId) {
        await tx.cartLead.update({ where: { id: dto.leadId }, data: { status: 'CONVERTED', convertedOrderId: created.id } });
      }
      return created;
    });

    if (dto.markPaid) {
      await this.checkout.markPaid(order.id, { method: dto.paymentMethod, reference: dto.paymentReference });
    }
    return this.get(shopId, order.id);
  }

  /**
   * Where the goods are, kept apart from payment. Moving to SHIPPED or
   * DELIVERED stamps the time (and DELIVERED fills in a missing SHIPPED
   * time); moving back to UNFULFILLED clears them, so a mistaken click can be
   * undone. A cancelled order isn't shipped.
   */
  async setFulfilment(shopId: string, orderId: string, status: FulfilmentStatus, trackingNote?: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, shopId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'CANCELLED') throw new BadRequestException('A cancelled order can\'t be shipped.');

    const now = new Date();
    const data: Prisma.OrderUpdateInput = { fulfilmentStatus: status };
    if (trackingNote !== undefined) data.trackingNote = trackingNote.trim() || null;
    if (status === 'UNFULFILLED') {
      data.shippedAt = null;
      data.deliveredAt = null;
    } else if (status === 'SHIPPED') {
      data.shippedAt = order.shippedAt ?? now;
      data.deliveredAt = null;
    } else {
      data.shippedAt = order.shippedAt ?? now;
      data.deliveredAt = now;
    }
    await this.prisma.order.update({ where: { id: orderId }, data });
    return this.get(shopId, orderId);
  }

  async addNote(shopId: string, orderId: string, user: { firstName: string; lastName: string }, text: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, shopId }, select: { id: true } });
    if (!order) throw new NotFoundException('Order not found');
    return this.prisma.orderNote.create({
      data: { orderId, authorName: authorLabel(user), text: text.trim() },
    });
  }
}
