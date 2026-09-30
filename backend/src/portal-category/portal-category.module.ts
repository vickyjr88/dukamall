import { Module } from '@nestjs/common';
import { PortalCategoryService } from './portal-category.service';
import { PortalCategoryController } from './portal-category.controller';

@Module({
  controllers: [PortalCategoryController],
  providers: [PortalCategoryService],
})
export class PortalCategoryModule {}
