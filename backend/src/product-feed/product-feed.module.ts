import { Module } from '@nestjs/common';
import { ProductFeedService } from './product-feed.service';
import { ProductFeedController } from './product-feed.controller';

@Module({
  controllers: [ProductFeedController],
  providers: [ProductFeedService],
})
export class ProductFeedModule {}
