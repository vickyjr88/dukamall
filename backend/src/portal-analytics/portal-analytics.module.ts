import { Module } from '@nestjs/common';
import { PortalAnalyticsService } from './portal-analytics.service';
import { PortalAnalyticsController } from './portal-analytics.controller';

@Module({
  controllers: [PortalAnalyticsController],
  providers: [PortalAnalyticsService],
})
export class PortalAnalyticsModule {}
