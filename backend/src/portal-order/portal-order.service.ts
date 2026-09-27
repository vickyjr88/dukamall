import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PortalOrderService {
  constructor(private prisma: PrismaService) {}

  list(shopId: string, status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: { shopId, ...(status ? { status } : {}) },
      include: { lines: { include: { variant: { include: { product: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
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
    // Cancelling an order that already decremented stock (see
    // CheckoutService.verify -- stock is only decremented on confirmed
    // Paystack payment, not at checkout start) should return that stock,
    // since the shop can now sell it again. Only do this on the PAID ->
    // CANCELLED transition specifically -- a PENDING order never touched
    // stock in the first place, so reversing it there would incorrectly
    // inflate stockOnHand.
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
