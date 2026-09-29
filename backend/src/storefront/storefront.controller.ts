import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StorefrontService } from './storefront.service';
import { Public } from '../auth/decorators/public.decorator';
import { ShopId } from '../common/shop-context';

@ApiTags('storefront')
@Controller('shop')
export class StorefrontController {
  constructor(private storefront: StorefrontService) {}

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
}
