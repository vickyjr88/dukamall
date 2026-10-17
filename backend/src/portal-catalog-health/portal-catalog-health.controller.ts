import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PortalCatalogHealthService } from './portal-catalog-health.service';
import { ShopId } from '../common/shop-context';

@ApiTags('portal-catalog-health')
@ApiBearerAuth()
@Controller('portal/catalog-health')
export class PortalCatalogHealthController {
  constructor(private health: PortalCatalogHealthService) {}

  @Get()
  check(@ShopId() shopId: string) {
    return this.health.check(shopId);
  }
}
