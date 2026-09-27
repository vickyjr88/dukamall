import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PortalProductService } from './portal-product.service';
import { CreateProductDto, UpdateProductDto, UpdateVariantDto } from './portal-product.dto';
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

  @Patch(':id')
  update(@ShopId() shopId: string, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.portalProductService.update(shopId, id, dto);
  }

  @Patch(':id/active')
  setActive(@ShopId() shopId: string, @Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.portalProductService.setActive(shopId, id, isActive);
  }

  @Patch('variants/:variantId')
  updateVariant(@ShopId() shopId: string, @Param('variantId') variantId: string, @Body() dto: UpdateVariantDto) {
    return this.portalProductService.updateVariant(shopId, variantId, dto);
  }

  @Patch('variants/:variantId/stock')
  adjustStock(@ShopId() shopId: string, @Param('variantId') variantId: string, @Body('delta') delta: number) {
    return this.portalProductService.adjustStock(shopId, variantId, delta);
  }

  @Patch('variants/:variantId/stock/set')
  setStock(@ShopId() shopId: string, @Param('variantId') variantId: string, @Body('stockOnHand') stockOnHand: number) {
    return this.portalProductService.setStock(shopId, variantId, stockOnHand);
  }
}
