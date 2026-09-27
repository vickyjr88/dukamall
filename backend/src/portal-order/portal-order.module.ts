import { Module } from '@nestjs/common';
import { PortalOrderService } from './portal-order.service';
import { PortalOrderController } from './portal-order.controller';

@Module({
  controllers: [PortalOrderController],
  providers: [PortalOrderService],
})
export class PortalOrderModule {}
