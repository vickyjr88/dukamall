import { BadRequestException, Controller, Headers, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { CheckoutService } from './checkout.service';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';

/**
 * Server-to-server payment confirmation, independent of the shopper's own
 * browser ever calling GET /checkout/:orderId/verify -- the gap that
 * verify-only left: a shopper who pays on Paystack's hosted page and then
 * closes the tab (a lost connection, an impatient tap-away) leaves their
 * order stuck PENDING forever even though Paystack actually took the
 * money, because nothing else ever calls verify() for them. Paystack POSTs
 * here the moment it knows the outcome, independent of what the shopper's
 * browser does next.
 *
 * @NoShopScope() because the request arrives with no x-shop-id and no
 * staff/customer JWT -- the order's own reference (== Order.id, set in
 * CheckoutService.start's `reference: order.id`) is how this finds which
 * shop's Paystack secret key to verify the signature against, which has to
 * happen BEFORE trusting anything else in the payload: a shop's own secret
 * key is the only thing that proves a webhook claiming to be about that
 * shop's order actually came from Paystack and not from someone who just
 * guessed an order id.
 */
@ApiExcludeController()
@Controller('paystack/webhook')
@Public()
@NoShopScope()
export class PaystackWebhookController {
  private readonly logger = new Logger(PaystackWebhookController.name);

  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    private checkout: CheckoutService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(@Req() req: Request, @Headers('x-paystack-signature') signature?: string) {
    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (!rawBody) {
      // Should be unreachable given main.ts's json() verify hook, but fail
      // loudly rather than silently skipping verification if it ever is.
      throw new BadRequestException('Missing raw request body');
    }

    const event = JSON.parse(rawBody.toString('utf-8'));
    const reference: string | undefined = event?.data?.reference;
    if (!reference) return { received: true };

    const order = await this.prisma.order.findUnique({ where: { id: reference }, include: { shop: true } });
    if (!order) {
      // Not this platform's reference at all, or a stale/replayed one --
      // 200 either way, since returning an error here just makes Paystack
      // retry a webhook this endpoint will never be able to resolve.
      this.logger.warn(`Webhook for unknown order reference: ${reference}`);
      return { received: true };
    }

    const secretKey = order.shop.paystackSecretKey;
    if (!this.paystack.verifySignature(secretKey || '', rawBody, signature)) {
      this.logger.warn(`Webhook signature check failed for order ${order.orderNumber} (shop ${order.shopId})`);
      throw new BadRequestException('Invalid signature');
    }

    if (event.event === 'charge.success') {
      await this.checkout.markPaid(order.id, { method: 'PAYSTACK', alertMerchant: true });
    }

    return { received: true };
  }
}
