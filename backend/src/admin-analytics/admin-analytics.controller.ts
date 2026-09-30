import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminAnalyticsService, Granularity } from './admin-analytics.service';
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';
import { parseRangeEnd } from '../common/date-range';

// Same guard stack as AdminController -- see that controller's own header
// comment for why all three (@Public, @NoShopScope, AdminJwtGuard) are
// needed together.
@ApiTags('admin-analytics')
@Controller('admin/analytics')
@Public()
@NoShopScope()
@UseGuards(AdminJwtGuard)
export class AdminAnalyticsController {
  constructor(private adminAnalyticsService: AdminAnalyticsService) {}

  @Get('revenue-trend')
  revenueTrend(@Query('from') from?: string, @Query('to') to?: string, @Query('granularity') granularity?: Granularity) {
    return this.adminAnalyticsService.revenueTrend(from ? new Date(from) : undefined, parseRangeEnd(to), granularity);
  }

  @Get('shop-leaderboard')
  shopLeaderboard(@Query('from') from?: string, @Query('to') to?: string) {
    return this.adminAnalyticsService.shopLeaderboard(from ? new Date(from) : undefined, parseRangeEnd(to));
  }

  @Get('lifecycle-funnel')
  lifecycleFunnel(@Query('from') from?: string, @Query('to') to?: string) {
    return this.adminAnalyticsService.lifecycleFunnel(from ? new Date(from) : undefined, parseRangeEnd(to));
  }

  @Get('shop-churn')
  newAndChurnedShops(@Query('from') from?: string, @Query('to') to?: string) {
    return this.adminAnalyticsService.newAndChurnedShops(from ? new Date(from) : undefined, parseRangeEnd(to));
  }
}
