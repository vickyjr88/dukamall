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
  listProducts(@ShopId() shopId: string, @Query('category') category?: string) {
    return this.storefront.listProducts(shopId, category);
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
}
