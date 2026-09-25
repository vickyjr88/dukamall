import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ShopService } from './shop.service';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';
import { ShopId } from '../common/shop-context';

@ApiTags('shop')
@Controller()
export class ShopController {
  constructor(private shopService: ShopService) {}

  // Called by web/middleware.ts on (effectively) every request, resolving the
  // incoming Host header to a shop. Public and unauthenticated on purpose --
  // it runs before any session exists, and it is the thing that PRODUCES a
  // shopId, so it cannot itself require one.
  @Public()
  @NoShopScope()
  @Get('resolve-shop/:host')
  resolveShop(@Param('host') host: string) {
    return this.shopService.resolveByHost(host);
  }

  @Public()
  @Get('shop/theme')
  getTheme(@ShopId() shopId: string) {
    return this.shopService.getTheme(shopId);
  }

  // Staff-only in practice (behind the global JwtAuthGuard); not marked
  // @Public(). shopId comes from the caller's own JWT via ShopScopeGuard, so
  // a shop's staff can only ever update their own theme.
  @Put('portal/theme')
  updateTheme(@ShopId() shopId: string, @Body() body: Record<string, string>) {
    return this.shopService.updateTheme(shopId, body);
  }
}
