import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SECTION_KEYS } from '../common/sections';
import { PortalCategoryService } from './portal-category.service';
import { ShopId } from '../common/shop-context';

class CategoryNameDto {
  @IsString() @IsNotEmpty() name!: string;
  /** The section the category belongs to (watches, clothes, electronics, devices, footwear); it decides how its products are entered. */
  @IsOptional() @IsIn(SECTION_KEYS) section?: string;
}

class SetSectionDto {
  /** null moves the category out of any section (its products go back to plain sizes). */
  @IsOptional() @IsIn([...SECTION_KEYS, null]) section!: string | null;
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
    return this.portalCategoryService.create(shopId, dto.name, dto.section);
  }

  @Patch(':id')
  rename(@ShopId() shopId: string, @Param('id') id: string, @Body() dto: CategoryNameDto) {
    return this.portalCategoryService.rename(shopId, id, dto.name);
  }

  @Patch(':id/section')
  setSection(@ShopId() shopId: string, @Param('id') id: string, @Body() dto: SetSectionDto) {
    return this.portalCategoryService.setSection(shopId, id, dto.section ?? null);
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
