import { Module } from '@nestjs/common';
import { PortalAnalyticsService } from './portal-analytics.service';
import { PortalAnalyticsController } from './portal-analytics.controller';
import { FunnelService } from './funnel.service';
import { AdSpendService } from './ad-spend.service';
import { MoneyService } from './money.service';
import { StockService } from './stock.service';
import { BuyersService } from './buyers.service';

@Module({
  controllers: [PortalAnalyticsController],
  providers: [PortalAnalyticsService, FunnelService, AdSpendService, MoneyService, StockService, BuyersService],
})
export class PortalAnalyticsModule {}
