import { Module } from '@nestjs/common';
import { PortalOrderService } from './portal-order.service';
import { PortalOrderController } from './portal-order.controller';
import { CheckoutModule } from '../checkout/checkout.module';

@Module({
  imports: [CheckoutModule],
  controllers: [PortalOrderController],
  providers: [PortalOrderService],
})
export class PortalOrderModule {}
