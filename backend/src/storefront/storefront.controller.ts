import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StorefrontService } from './storefront.service';
import { Public } from '../auth/decorators/public.decorator';
import { ShopId } from '../common/shop-context';
import { PortalDiscountService } from '../portal-discount/portal-discount.service';
import { RateLimit } from '../common/rate-limit.decorator';

@ApiTags('storefront')
@Controller('shop')
export class StorefrontController {
  constructor(private storefront: StorefrontService, private discounts: PortalDiscountService) {}

  @Public()
  @Get('products')
  listProducts(
    @ShopId() shopId: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('size') size?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('sort') sort?: string,
  ) {
    return this.storefront.listProducts(shopId, { category, brand, size, search, minPrice, maxPrice, sort });
  }

  @Public()
  @Get('products/featured')
  listFeatured(@ShopId() shopId: string) {
    return this.storefront.listFeatured(shopId);
  }

  @Public()
  @Get('products/:slug')
  getProduct(@ShopId() shopId: string, @Param('slug') slug: string) {
    return this.storefront.getBySlug(shopId, slug);
  }

  @Public()
  @Get('categories')
  listCategories(@ShopId() shopId: string) {
    return this.storefront.listCategories(shopId);
  }

  // The search bar's filter dropdowns/chips -- distinct brand/size values
  // actually present in this shop's catalogue, not a fixed platform-wide
  // list.
  @Public()
  @Get('filters')
  filters(@ShopId() shopId: string) {
    return this.storefront.filters(shopId);
  }

  // A read-only preview for the cart's "apply code" box -- resolves the
  // same way checkout itself will (PortalDiscountService.resolveForCheckout
  // is the one shared place that decides validity/amount), but does NOT
  // redeem it: no DiscountRedemption row is written here, only at actual
  // checkout, so a shopper who previews a code and then abandons their cart
  // hasn't spent one of its limited uses.
  @Public()
  @RateLimit(20, 60)
  @Get('discounts/validate')
  async validateDiscount(@ShopId() shopId: string, @Query('code') code: string, @Query('subtotalKes') subtotalKes: string) {
    const resolved = await this.discounts.resolveForCheckout(shopId, code || '', Number(subtotalKes) || 0);
    return { valid: true, discountKes: resolved.discountKes, code: resolved.discount.code };
  }
}
