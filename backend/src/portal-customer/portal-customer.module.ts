import { Module } from '@nestjs/common';
import { PortalCustomerService } from './portal-customer.service';
import { PortalCustomerController } from './portal-customer.controller';

@Module({
  controllers: [PortalCustomerController],
  providers: [PortalCustomerService],
  exports: [PortalCustomerService],
})
export class PortalCustomerModule {}
