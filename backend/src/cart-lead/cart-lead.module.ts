import { Module } from '@nestjs/common';
import { CartLeadService } from './cart-lead.service';
import { CartLeadController } from './cart-lead.controller';

@Module({
  controllers: [CartLeadController],
  providers: [CartLeadService],
})
export class CartLeadModule {}
