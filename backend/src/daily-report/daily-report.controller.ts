import { BadRequestException, Body, Controller, Get, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ShopId } from '../common/shop-context';
import { DailyReportService } from './daily-report.service';
import { UpdateDailyReportSettingsDto } from './dto';
import { DATE_KEY, localDateKey } from './daily-report.window';

function parseDate(date?: string) {
  if (date === undefined) return undefined;
  // The report is of a finished day: today (and the future) has no complete figures yet.
  if (!DATE_KEY.test(date) || date >= localDateKey(new Date())) throw new BadRequestException('date must be a finished day, as YYYY-MM-DD (Nairobi time).');
  return date;
}

@ApiTags('portal-daily-report')
@ApiBearerAuth()
@Controller('portal/daily-report')
// Owner-only: it carries the shop's revenue figures and decides who receives them.
@Roles('OWNER')
export class DailyReportController {
  constructor(private readonly service: DailyReportService) {}

  @Get('settings')
  settings(@ShopId() shopId: string) {
    return this.service.getSettings(shopId);
  }

  @Put('settings')
  updateSettings(@ShopId() shopId: string, @Body() dto: UpdateDailyReportSettingsDto, @Req() request: any) {
    return this.service.updateSettings(shopId, dto, request?.user?.email ?? 'unknown');
  }

  /** Renders the report without sending it. Defaults to yesterday. */
  @Get('preview')
  preview(@ShopId() shopId: string, @Query('date') date?: string) {
    return this.service.preview(shopId, parseDate(date));
  }

  /** Sends now. A day already sent is not sent again unless `force=true`. */
  @Post('send')
  send(@ShopId() shopId: string, @Query('date') date?: string, @Query('force') force?: string) {
    return this.service.deliver(shopId, parseDate(date), { force: force === 'true' });
  }

  @Get('runs')
  runs(@ShopId() shopId: string) {
    return this.service.recentRuns(shopId);
  }
}
