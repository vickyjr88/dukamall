import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Granularity, PortalAnalyticsService } from './portal-analytics.service';
import { ShopId } from '../common/shop-context';
import { Roles } from '../auth/decorators/roles.decorator';
import { parseRangeEnd } from '../common/date-range';

@ApiTags('portal-analytics')
@ApiBearerAuth()
@Controller('portal/analytics')
// Owner-only: revenue and customer figures are the owner business data.
@Roles('OWNER')
export class PortalAnalyticsController {
  constructor(private portalAnalyticsService: PortalAnalyticsService) {}

  @Get('revenue-trend')
  revenueTrend(
    @ShopId() shopId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('granularity') granularity?: Granularity,
  ) {
    return this.portalAnalyticsService.revenueTrend(shopId, from ? new Date(from) : undefined, parseRangeEnd(to), granularity);
  }

  @Get('sales-breakdown')
  salesBreakdown(@ShopId() shopId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.portalAnalyticsService.salesByCategoryAndBrand(shopId, from ? new Date(from) : undefined, parseRangeEnd(to));
  }

  @Get('customers')
  customerInsights(@ShopId() shopId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.portalAnalyticsService.customerInsights(shopId, from ? new Date(from) : undefined, parseRangeEnd(to));
  }

  @Get('lead-conversion')
  leadConversion(@ShopId() shopId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.portalAnalyticsService.leadConversion(shopId, from ? new Date(from) : undefined, parseRangeEnd(to));
  }
}
