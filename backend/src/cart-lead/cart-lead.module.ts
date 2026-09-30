import { Module } from '@nestjs/common';
import { CartLeadService } from './cart-lead.service';
import { CartLeadController, PortalCartLeadController } from './cart-lead.controller';

@Module({
  controllers: [CartLeadController, PortalCartLeadController],
  providers: [CartLeadService],
})
export class CartLeadModule {}
