import { Module } from '@nestjs/common';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { DomainVerificationService } from './domain-verification.service';

@Module({
  controllers: [ShopController],
  providers: [ShopService, DomainVerificationService],
  exports: [ShopService],
})
export class ShopModule {}
