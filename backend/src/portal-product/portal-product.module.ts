import { Module } from '@nestjs/common';
import { PortalProductService } from './portal-product.service';
import { PortalProductController } from './portal-product.controller';

@Module({
  controllers: [PortalProductController],
  providers: [PortalProductService],
})
export class PortalProductModule {}
