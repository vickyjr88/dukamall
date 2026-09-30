import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { PaystackWebhookController } from './paystack-webhook.controller';
import { PaystackModule } from '../paystack/paystack.module';
import { PortalDiscountModule } from '../portal-discount/portal-discount.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PaystackModule, PortalDiscountModule, EmailModule],
  controllers: [CheckoutController, PaystackWebhookController],
  providers: [CheckoutService],
  // PortalOrderModule needs markPaid() for the merchant-initiated
  // PENDING -> PAID transition (a cash/WhatsApp order a staff member marks
  // paid by hand) -- see PortalOrderService.setStatus's own comment on why
  // that path must go through the same stock-decrement + email logic as an
  // online payment, not a second copy of it.
  exports: [CheckoutService],
})
export class CheckoutModule {}
