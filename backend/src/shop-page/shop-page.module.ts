import { Module } from '@nestjs/common';
import { ShopPageService } from './shop-page.service';
import { PortalPagesController, StorefrontPagesController } from './shop-page.controller';

@Module({
  controllers: [StorefrontPagesController, PortalPagesController],
  providers: [ShopPageService],
})
export class ShopPageModule {}
