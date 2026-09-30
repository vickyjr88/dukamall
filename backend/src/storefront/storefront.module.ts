import { Module } from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import { StorefrontController } from './storefront.controller';
import { PortalDiscountModule } from '../portal-discount/portal-discount.module';

@Module({
  imports: [PortalDiscountModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
