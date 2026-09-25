import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ProductFeedService } from './product-feed.service';
import { feedCsv, feedXml } from './feed-formats';
import { Public } from '../auth/decorators/public.decorator';
import { ShopId } from '../common/shop-context';
import { PrismaService } from '../prisma/prisma.service';
import { storefrontOriginForShop } from '../common/storefront-origin';

/**
 * One route per output format, same TikTok-gets-its-own-URL reasoning as
 * drip-crm (a platform's catalog manager wants its own stable URL to poll
 * rather than sharing another platform's), but every route reads from the
 * same ProductFeedService.buildRows -- see that file's header comment.
 *
 * Reached via the shop's own domain (nairobigents.co.ke/product-feed.xml),
 * resolved to a shopId by the same ShopScopeGuard/x-shop-id header path as
 * every other public storefront route -- see web/middleware.ts.
 */
@ApiExcludeController()
@Controller()
export class ProductFeedController {
  constructor(private feedService: ProductFeedService, private prisma: PrismaService) {}

  @Public()
  @Get('product-feed.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async xml(@ShopId() shopId: string) {
    const [shop, rows] = await Promise.all([
      this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } }),
      this.feedService.buildRows(shopId),
    ]);
    return feedXml(shop.name, storefrontOriginForShop(shop), rows);
  }

  @Public()
  @Get('product-feed-tiktok.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  tiktokXml(@ShopId() shopId: string) {
    return this.xml(shopId);
  }

  @Public()
  @Get('product-feed.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(@ShopId() shopId: string) {
    const rows = await this.feedService.buildRows(shopId);
    return feedCsv(rows);
  }

  @Public()
  @Get('product-feed-tiktok.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  tiktokCsv(@ShopId() shopId: string) {
    return this.csv(shopId);
  }
}
