import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { CheckoutDto } from './checkout.dto';
import { storefrontOriginForShop } from '../common/storefront-origin';

@Injectable()
export class CheckoutService {
  constructor(private prisma: PrismaService, private paystack: PaystackService) {}

  private async nextOrderNumber(shopId: string, prefix: string): Promise<string> {
    // Simple count-based sequence, scoped to the shop -- good enough at this
    // volume; a real sequence table is one of the things to revisit only if
    // a shop's order rate makes a race here observable in practice.
    const count = await this.prisma.order.count({ where: { shopId } });
    return `${prefix}-${String(count + 1).padStart(5, '0')}`;
  }

  async start(shopId: string, dto: CheckoutDto) {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });

    const variantIds = dto.lines.map((l) => l.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, product: { shopId } },
    });
    if (variants.length !== variantIds.length) {
      throw new NotFoundException('One or more items are no longer available');
    }

    let subtotal = 0;
    const orderLinesData = dto.lines.map((line) => {
      const variant = variants.find((v) => v.id === line.variantId)!;
      const price = Number(variant.priceKes);
      subtotal += price * line.quantity;
      return { variantId: variant.id, quantity: line.quantity, priceKes: price };
    });

    const shipping = 0; // Arranged after order, per drip-crm precedent; not charged at checkout.
    const total = subtotal + shipping;
    const orderNumber = await this.nextOrderNumber(shopId, shop.orderPrefix);

    const order = await this.prisma.order.create({
      data: {
        shopId,
        orderNumber,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        shippingAddress: dto.shippingAddress,
        subtotalKes: subtotal,
        shippingKes: shipping,
        totalKes: total,
        lines: { create: orderLinesData },
      },
    });

    if (!shop.paystackSecretKey) {
      return { order, online: false };
    }

    const paystackResult = await this.paystack.initialise(shop.paystackSecretKey, shop.currency, {
      email: dto.email || 'no-reply@example.com',
      amount: total,
      reference: order.id,
      callbackUrl: `${storefrontOriginForShop(shop)}/checkout/complete?order=${order.id}`,
      metadata: { orderId: order.id, shopId },
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: { paystackReference: paystackResult.reference },
    });

    return { order, online: true, authorizationUrl: paystackResult.authorization_url };
  }

  async verify(shopId: string, orderId: string) {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.shopId !== shopId) throw new NotFoundException('Order not found');
    if (!order.paystackReference || !shop.paystackSecretKey) {
      throw new BadRequestException('This order has no online payment to verify');
    }

    const result = await this.paystack.verify(shop.paystackSecretKey, order.paystackReference);
    if (result.status === 'success') {
      // Decrement stock only on confirmed payment -- never at checkout start,
      // since an abandoned or failed Paystack session must not reserve stock
      // indefinitely.
      const lines = await this.prisma.orderLine.findMany({ where: { orderId } });
      await this.prisma.$transaction([
        this.prisma.order.update({ where: { id: orderId }, data: { status: 'PAID' } }),
        ...lines.map((line) =>
          this.prisma.productVariant.update({
            where: { id: line.variantId },
            data: { stockOnHand: { decrement: line.quantity } },
          }),
        ),
      ]);
    }
    return this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  }
}
