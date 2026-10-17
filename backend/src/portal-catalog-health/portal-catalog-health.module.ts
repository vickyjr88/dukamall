import { Module } from '@nestjs/common';
import { PortalCatalogHealthController } from './portal-catalog-health.controller';
import { PortalCatalogHealthService } from './portal-catalog-health.service';

@Module({
  controllers: [PortalCatalogHealthController],
  providers: [PortalCatalogHealthService],
})
export class PortalCatalogHealthModule {}
