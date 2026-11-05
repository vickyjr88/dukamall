import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { ShopId } from '../common/shop-context';
import { RateLimit } from '../common/rate-limit.decorator';
import { StorefrontEventsService } from './storefront-events.service';

/** Where the storefront reports what shoppers do. Public like the rest of the storefront, scoped to one shop by x-shop-id. */
@ApiExcludeController()
@Controller('shop/events')
export class StorefrontEventsController {
  constructor(private events: StorefrontEventsService) {}

  @Public()
  @RateLimit(120, 60)
  @HttpCode(202)
  @Post()
  record(@ShopId() shopId: string, @Body() body: { sessionId?: unknown; events?: unknown }, @Req() req: Request) {
    let originHost: string | undefined;
    try {
      originHost = req.headers.origin ? new URL(String(req.headers.origin)).hostname : undefined;
    } catch {
      originHost = undefined;
    }
    return this.events.record(shopId, body, { userAgent: req.headers['user-agent'], originHost });
  }
}
