import { Module } from '@nestjs/common';
import { PortalDiscountService } from './portal-discount.service';
import { PortalDiscountController } from './portal-discount.controller';

@Module({
  controllers: [PortalDiscountController],
  providers: [PortalDiscountService],
  exports: [PortalDiscountService],
})
export class PortalDiscountModule {}
