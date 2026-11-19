import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ShopId } from '../common/shop-context';
import { PortalShareService } from './portal-share.service';

/**
 * Share the shop's products from the portal: search, open WhatsApp / Facebook / X / Telegram with the message and a tagged link ready,
 * or send several products as one catalogue message. Posts nothing for anyone -- a person presses send on the network's own screen.
 * Open to staff as well as the owner: it reads the shop's public catalogue and sends nothing.
 */
@ApiTags('portal-share')
@ApiBearerAuth()
@Controller('portal/share')
export class PortalShareController {
  constructor(private readonly service: PortalShareService) {}

  @Get('context')
  context(@ShopId() shopId: string) {
    return this.service.context(shopId);
  }

  @Get('search')
  search(@ShopId() shopId: string, @Query('q') q?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.service.search(shopId, { q, page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined });
  }

  @Post('catalogue')
  catalogue(@ShopId() shopId: string, @Body() body: { ids?: string[] }) {
    return this.service.catalogue(shopId, body?.ids);
  }

  @Get('link')
  link(@ShopId() shopId: string, @Query() q: { target?: string; slug?: string; path?: string; source?: string; medium?: string; campaign?: string }) {
    return this.service.buildLink(shopId, q ?? {});
  }

  @Post('event')
  event(@ShopId() shopId: string, @Req() request: any, @Body() body: { channel?: unknown; kind?: unknown; productSlug?: unknown; itemCount?: unknown }) {
    return this.service.record(shopId, request?.user?.email ?? 'unknown', body ?? {});
  }

  @Get('stats')
  stats(@ShopId() shopId: string, @Query('days') days?: string) {
    return this.service.stats(shopId, Math.min(90, Math.max(1, Number(days) || 7)));
  }
}
