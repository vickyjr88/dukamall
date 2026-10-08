import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { CheckoutDto } from './checkout.dto';
import { storefrontOriginForShop } from '../common/storefront-origin';
import { PortalDiscountService } from '../portal-discount/portal-discount.service';
import { EmailService } from '../email/email.service';
import { orderConfirmationEmail } from '../email/email-templates';
import { PaymentMethod } from '@prisma/client';
import { deliveryFeeFor, nextOrderNumber } from '../common/order-helpers';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    private discounts: PortalDiscountService,
    private email: EmailService,
    private notifications: NotificationsService,
  ) {}

  async start(shopId: string, dto: CheckoutDto, customerId: string | null) {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });

    // A customerId comes only from a verified JWT (see OptionalCustomer),
    // never from the request body -- but it could still be a customer
    // belonging to a DIFFERENT shop if a token somehow reached here for the
    // wrong tenant (shouldn't happen given CustomerJwtGuard's own shopId
    // check, but checkout doesn't run behind that guard, so this is the
    // only place left to catch it). A mismatch is treated as "not logged
    // in" rather than an error -- an order should still go through as a
    // guest rather than fail outright over a stale/cross-shop token.
    const customer = customerId
      ? await this.prisma.customer.findFirst({ where: { id: customerId, shopId } })
      : null;

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

    // Resolved before the Order row exists -- an invalid/expired/exhausted
    // code must fail checkout outright (400), not create an order and then
    // silently apply no discount, which would look like the code "didn't
    // work" for a reason the shopper can't see.
    let discountId: string | undefined;
    let discountKes = 0;
    if (dto.discountCode) {
      const resolved = await this.discounts.resolveForCheckout(shopId, dto.discountCode, subtotal);
      discountId = resolved.discount.id;
      discountKes = resolved.discountKes;
    }

    // The shop's flat delivery fee, waived above its free-delivery threshold.
    // Decided here, never taken from the client: the cart shows the same
    // number for display, but this is the one that is charged.
    const afterDiscount = Math.max(0, subtotal - discountKes);
    const shipping = deliveryFeeFor(shop, afterDiscount);
    const total = afterDiscount + shipping;
    const orderNumber = await nextOrderNumber(this.prisma, shopId, shop.orderPrefix);

    const order = await this.prisma.order.create({
      data: {
        shopId,
        customerId: customer?.id,
        orderNumber,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        shippingAddress: dto.shippingAddress,
        subtotalKes: subtotal,
        shippingKes: shipping,
        discountKes,
        discountId,
        totalKes: total,
        lines: { create: orderLinesData },
      },
    });

    // Counted as redeemed at checkout start, not on payment confirmation --
    // a code's usage limit is about how many times it was claimed, the same
    // reasoning a one-per-customer promo code enforces in any commerce
    // platform; a PENDING order that never gets paid still occupied a slot
    // and can be cancelled by a merchant like any other unpaid order.
    if (discountId) {
      await this.prisma.discountRedemption.create({ data: { discountId, orderId: order.id } });
    }

    if (!shop.paystackSecretKey) {
      // No online payment to wait for, so this order is actionable now: tell
      // the merchant. (An online order is announced when it is PAID instead --
      // see markPaid -- since an abandoned payment would otherwise page them
      // for nothing.)
      void this.notifications.newOrder(order.id);
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
      await this.markPaid(orderId, { method: 'PAYSTACK', alertMerchant: true });
    }
    return this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  }

  /**
   * The single place an order actually transitions to PAID -- both the
   * shopper-initiated verify() above and Paystack's own webhook
   * (PaystackWebhookController) call this, so stock is decremented and the
   * confirmation email is sent exactly once no matter which path notices
   * the payment first. Safe to call more than once for the same order (a
   * shopper's browser calling verify() right as the webhook also fires):
   * the findFirst guard below only acts on an order that's still PENDING,
   * so a second call is a harmless no-op rather than double-decrementing
   * stock.
   *
   * `payment` records how it was paid (a merchant marking a cash or M-Pesa
   * order paid supplies it; the online paths pass PAYSTACK). `alertMerchant`
   * is set only by those online paths: when a staff member marks an order paid
   * they obviously already know.
   */
  async markPaid(
    orderId: string,
    payment: { method?: PaymentMethod; reference?: string; alertMerchant?: boolean } = {},
  ) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, status: 'PENDING' } });
    if (!order) return; // Already PAID (or CANCELLED) -- nothing to do.

    const lines = await this.prisma.orderLine.findMany({
      where: { orderId },
      include: { variant: { include: { product: true } } },
    });
    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paymentMethod: payment.method ?? (order.paystackReference ? 'PAYSTACK' : null),
          ...(payment.reference ? { paymentReference: payment.reference } : {}),
        },
      }),
      ...lines.map((line) =>
        this.prisma.productVariant.update({
          where: { id: line.variantId },
          data: { stockOnHand: { decrement: line.quantity } },
        }),
      ),
    ]);

    if (order.email) {
      const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: order.shopId } });
      const { subject, html } = orderConfirmationEmail({
        shopName: shop.name,
        orderNumber: order.orderNumber,
        firstName: order.firstName,
        lines: lines.map((l) => ({ name: l.variant.product.name, variantName: l.variant.name, quantity: l.quantity, priceKes: Number(l.priceKes) })),
        subtotalKes: Number(order.subtotalKes),
        discountKes: Number(order.discountKes),
        shippingKes: Number(order.shippingKes),
        totalKes: Number(order.totalKes),
        currency: shop.currency,
      });
      const sent = await this.email.send(order.email, subject, html);
      if (!sent) this.logger.warn(`Order confirmation email not sent for order ${order.orderNumber} (SMTP unconfigured or send failed)`);
    }

    if (payment.alertMerchant) void this.notifications.newOrder(orderId);
  }
}
