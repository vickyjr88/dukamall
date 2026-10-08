import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ShopId } from '../common/shop-context';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('reports')
@Controller('portal/reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  // Revenue totals: owner-only. The stock report below stays open to staff.
  @Roles('OWNER')
  @Get('sales')
  sales(@ShopId() shopId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.salesSummary(shopId, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get('stock')
  stock(@ShopId() shopId: string) {
    return this.reportsService.stockLevels(shopId);
  }
}
