import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ShopPageService } from './shop-page.service';
import { CreateShopPageDto, UpdateShopPageDto } from './shop-page.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ShopId } from '../common/shop-context';

// What shoppers see: published pages only.
@ApiTags('storefront')
@Controller('shop/pages')
export class StorefrontPagesController {
  constructor(private pages: ShopPageService) {}

  @Public()
  @Get()
  list(@ShopId() shopId: string) {
    return this.pages.listPublished(shopId);
  }

  @Public()
  @Get(':slug')
  get(@ShopId() shopId: string, @Param('slug') slug: string) {
    return this.pages.getPublished(shopId, slug);
  }
}

// What the merchant edits. Reading is open to staff; changing the storefront's
// wording is an owner decision, like the theme.
@ApiTags('portal-pages')
@ApiBearerAuth()
@Controller('portal/pages')
export class PortalPagesController {
  constructor(private pages: ShopPageService) {}

  @Get()
  list(@ShopId() shopId: string) {
    return this.pages.list(shopId);
  }

  @Roles('OWNER')
  @Post('starters')
  addStarters(@ShopId() shopId: string) {
    return this.pages.addStarters(shopId);
  }

  @Get(':id')
  get(@ShopId() shopId: string, @Param('id') id: string) {
    return this.pages.get(shopId, id);
  }

  @Roles('OWNER')
  @Post()
  create(@ShopId() shopId: string, @Body() dto: CreateShopPageDto) {
    return this.pages.create(shopId, dto);
  }

  @Roles('OWNER')
  @Patch(':id')
  update(@ShopId() shopId: string, @Param('id') id: string, @Body() dto: UpdateShopPageDto) {
    return this.pages.update(shopId, id, dto);
  }

  @Roles('OWNER')
  @Post(':id/move/:direction')
  move(@ShopId() shopId: string, @Param('id') id: string, @Param('direction') direction: string) {
    return this.pages.move(shopId, id, direction === 'up' ? 'up' : 'down');
  }

  @Roles('OWNER')
  @Delete(':id')
  remove(@ShopId() shopId: string, @Param('id') id: string) {
    return this.pages.remove(shopId, id);
  }
}
