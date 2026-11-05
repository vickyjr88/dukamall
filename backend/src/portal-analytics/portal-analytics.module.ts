import { Module } from '@nestjs/common';
import { PortalAnalyticsService } from './portal-analytics.service';
import { PortalAnalyticsController } from './portal-analytics.controller';
import { FunnelService } from './funnel.service';

@Module({
  controllers: [PortalAnalyticsController],
  providers: [PortalAnalyticsService, FunnelService],
})
export class PortalAnalyticsModule {}
