import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Granularity, PortalAnalyticsService } from './portal-analytics.service';
import { FunnelService } from './funnel.service';
import { AdSpendInput, AdSpendService } from './ad-spend.service';
import { MoneyService } from './money.service';
import { StockService } from './stock.service';
import { BuyersService } from './buyers.service';
import { ShopId } from '../common/shop-context';
import { Roles } from '../auth/decorators/roles.decorator';
import { parseRangeEnd } from '../common/date-range';

@ApiTags('portal-analytics')
@ApiBearerAuth()
@Controller('portal/analytics')
// Owner-only: revenue and customer figures are the owner business data.
@Roles('OWNER')
export class PortalAnalyticsController {
  constructor(private portalAnalyticsService: PortalAnalyticsService, private funnelService: FunnelService, private adSpend: AdSpendService,
    private moneyService: MoneyService, private stockService: StockService, private buyersService: BuyersService) {}

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

  /** Visits to orders: the funnel, by source and device, with the products people looked at. */
  @Get('funnel')
  funnel(@ShopId() shopId: string, @Query('from') from?: string, @Query('to') to?: string) {
    const end = parseRangeEnd(to) ?? new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.funnelService.funnel(shopId, start, end);
  }

  /** What the owner has spent on ads, for setting against the orders those ads brought. */
  @Get('ad-spend')
  listAdSpend(@ShopId() shopId: string, @Query('from') from?: string, @Query('to') to?: string) {
    const end = parseRangeEnd(to) ?? new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.adSpend.list(shopId, new Date(start.toISOString().slice(0, 10)), new Date(end.toISOString().slice(0, 10)));
  }

  @Post('ad-spend')
  addAdSpend(@ShopId() shopId: string, @Body() body: AdSpendInput) {
    return this.adSpend.create(shopId, body ?? {});
  }

  @Delete('ad-spend/:id')
  removeAdSpend(@ShopId() shopId: string, @Param('id') id: string) {
    return this.adSpend.remove(shopId, id);
  }

  private window(from?: string, to?: string) {
    const end = parseRangeEnd(to) ?? new Date();
    return { start: from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000), end };
  }

  /** What was sold, what was kept, and what ads cost, over a period. */
  @Get('money')
  money(@ShopId() shopId: string, @Query('from') from?: string, @Query('to') to?: string) {
    const w = this.window(from, to);
    return this.moneyService.money(shopId, w.start, w.end);
  }

  /** Stock tied up, running low, sold out but wanted, and what earns the most. */
  @Get('stock')
  stock(@ShopId() shopId: string, @Query('from') from?: string, @Query('to') to?: string, @Query('deadDays') deadDays?: string) {
    const w = this.window(from, to);
    return this.stockService.stock(shopId, w.start, w.end, deadDays ? Math.min(365, Math.max(14, Number(deadDays) || 60)) : 60);
  }

  /** Who buys, who comes back, and who has gone quiet. */
  @Get('buyers')
  buyers(@ShopId() shopId: string, @Query('from') from?: string, @Query('to') to?: string, @Query('lapseDays') lapseDays?: string) {
    const w = this.window(from, to);
    return this.buyersService.buyers(shopId, w.start, w.end, lapseDays ? Math.min(365, Math.max(14, Number(lapseDays) || 60)) : 60);
  }
}
