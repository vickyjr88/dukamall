import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ShopId } from '../common/shop-context';
import { PostNowDto, UpdateSocialSettingsDto } from './dto';
import { SocialPostingService } from './social-posting.service';

const num = (v?: string) => (v === undefined || v === '' ? undefined : Number(v));

/**
 * The shop's marketing engine: products posted to its own Facebook Page and Threads account. Owner-only: a post is public, in the shop's name.
 * Everything is the shop's own: its settings, its posts and its connections.
 */
@ApiTags('portal-social')
@ApiBearerAuth()
@Controller('portal/social')
@Roles('OWNER')
export class SocialPostingController {
  constructor(private readonly service: SocialPostingService) {}

  @Get('status')
  status(@ShopId() shopId: string) {
    return this.service.status(shopId);
  }

  @Put('settings')
  settings(@ShopId() shopId: string, @Body() dto: UpdateSocialSettingsDto, @Req() request: any) {
    return this.service.updateSettings(shopId, dto, request?.user?.email ?? 'unknown');
  }

  /** What the next post would look like on each channel. Nothing is posted. */
  @Get('preview')
  preview(@ShopId() shopId: string, @Query('productId') productId?: string) {
    return this.service.preview(shopId, productId);
  }

  @Get('posts')
  posts(@ShopId() shopId: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.service.list(shopId, { page: num(page), pageSize: num(pageSize) });
  }

  /** Posts to the shop's Facebook Page or Threads now: a real, public post. */
  @Post('post-now')
  postNow(@ShopId() shopId: string, @Body() dto: PostNowDto, @Req() request: any) {
    return this.service.postNow(shopId, request?.user?.email ?? 'unknown', dto.productId, dto.channel ?? 'FACEBOOK');
  }

  /** Takes a post down from its channel. */
  @Delete('posts/:id')
  remove(@ShopId() shopId: string, @Param('id') id: string) {
    return this.service.remove(shopId, id);
  }
}
