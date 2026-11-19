import { Module } from '@nestjs/common';
import { PortalAnalyticsService } from './portal-analytics.service';
import { PortalAnalyticsController, PortalDashboardController } from './portal-analytics.controller';
import { FunnelService } from './funnel.service';
import { AdSpendService } from './ad-spend.service';
import { MoneyService } from './money.service';
import { StockService } from './stock.service';
import { BuyersService } from './buyers.service';
import { OverviewService } from './overview.service';

@Module({
  controllers: [PortalAnalyticsController, PortalDashboardController],
  providers: [PortalAnalyticsService, FunnelService, AdSpendService, MoneyService, StockService, BuyersService, OverviewService],
})
export class PortalAnalyticsModule {}
