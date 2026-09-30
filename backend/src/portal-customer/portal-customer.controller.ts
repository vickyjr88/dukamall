import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PortalCustomerService } from './portal-customer.service';
import { ShopId } from '../common/shop-context';

@ApiTags('portal-customer')
@ApiBearerAuth()
@Controller('portal/customers')
export class PortalCustomerController {
  constructor(private portalCustomerService: PortalCustomerService) {}

  @Get()
  list(
    @ShopId() shopId: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.portalCustomerService.list(shopId, {
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
