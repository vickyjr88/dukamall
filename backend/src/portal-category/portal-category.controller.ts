import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsString, IsNotEmpty } from 'class-validator';
import { PortalCategoryService } from './portal-category.service';
import { ShopId } from '../common/shop-context';

class CategoryNameDto {
  @IsString() @IsNotEmpty() name!: string;
}

class SetActiveDto {
  @IsBoolean() isActive!: boolean;
}

@ApiTags('portal-category')
@ApiBearerAuth()
@Controller('portal/categories')
export class PortalCategoryController {
  constructor(private portalCategoryService: PortalCategoryService) {}

  @Get()
  list(@ShopId() shopId: string) {
    return this.portalCategoryService.list(shopId);
  }

  @Post()
  create(@ShopId() shopId: string, @Body() dto: CategoryNameDto) {
    return this.portalCategoryService.create(shopId, dto.name);
  }

  @Patch(':id')
  rename(@ShopId() shopId: string, @Param('id') id: string, @Body() dto: CategoryNameDto) {
    return this.portalCategoryService.rename(shopId, id, dto.name);
  }

  @Patch(':id/active')
  setActive(@ShopId() shopId: string, @Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.portalCategoryService.setActive(shopId, id, dto.isActive);
  }

  @Delete(':id')
  remove(@ShopId() shopId: string, @Param('id') id: string) {
    return this.portalCategoryService.remove(shopId, id);
  }
}
