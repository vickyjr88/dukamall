import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PortalProductService } from './portal-product.service';
import { CreateProductDto } from './portal-product.dto';
import { ShopId } from '../common/shop-context';

@ApiTags('portal-product')
@ApiBearerAuth()
@Controller('portal/products')
export class PortalProductController {
  constructor(private portalProductService: PortalProductService) {}

  @Get()
  list(@ShopId() shopId: string) {
    return this.portalProductService.list(shopId);
  }

  @Post()
  create(@ShopId() shopId: string, @Body() dto: CreateProductDto) {
    return this.portalProductService.create(shopId, dto);
  }

  @Patch(':id/active')
  setActive(@ShopId() shopId: string, @Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.portalProductService.setActive(shopId, id, isActive);
  }

  @Patch('variants/:variantId/stock')
  adjustStock(@ShopId() shopId: string, @Param('variantId') variantId: string, @Body('delta') delta: number) {
    return this.portalProductService.adjustStock(shopId, variantId, delta);
  }
}
