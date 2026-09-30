import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutService } from '../checkout/checkout.service';

export type PortalOrderListQuery = {
  status?: OrderStatus;
  search?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class PortalOrderService {
  constructor(private prisma: PrismaService, private checkout: CheckoutService) {}

  // Same search/pagination shape as PortalProductService.list -- a shop with
  // a real order history (msa already has enough to matter) needs to find
  // "that order from last week" without scrolling an unbounded table.
  // Search matches order number or customer name/phone/email; unlike the
  // product search this has no fuzzy fallback, since order numbers and
  // phone numbers are exact-match lookups by nature, not typo-prone browsing.
  async list(shopId: string, query: PortalOrderListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));

    const where: Prisma.OrderWhereInput = {
      shopId,
      ...(query.status ? { status: query.status } : {}),
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

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { lines: { include: { variant: { include: { product: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { orders, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async get(shopId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, shopId },
      include: { lines: { include: { variant: { include: { product: true } } } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async setStatus(shopId: string, orderId: string, status: OrderStatus) {
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
      await this.checkout.markPaid(orderId);
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
}
