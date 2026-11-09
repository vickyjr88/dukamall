import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ShopId } from '../common/shop-context';
import { FacebookCommentsService } from './facebook-comments.service';

const num = (v?: string) => (v === undefined || v === '' ? undefined : Number(v));

/** The shop's Facebook comment replies: whether it is connected and switched on, the counts, and the comments with what was done about each. Owner-only. */
@ApiTags('portal-facebook')
@ApiBearerAuth()
@Controller('portal/facebook')
@Roles('OWNER')
export class FacebookController {
  constructor(private readonly comments: FacebookCommentsService) {}

  @Get('status')
  status(@ShopId() shopId: string) {
    return this.comments.status(shopId);
  }

  @Get('comments')
  list(@ShopId() shopId: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('status') status?: string) {
    return this.comments.list(shopId, { page: num(page), pageSize: num(pageSize), status });
  }
}
