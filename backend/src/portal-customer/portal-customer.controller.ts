import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PortalCustomerService } from './portal-customer.service';
import { ShopId } from '../common/shop-context';
import { Roles } from '../auth/decorators/roles.decorator';
import { toCsv } from '../common/csv';

const CUSTOMER_CSV_COLUMNS = ['name', 'email', 'phone', 'hasAccount', 'firstSeen', 'lastOrder', 'orders', 'paidOrders', 'lifetimeValueKes'];
const SORTS = ['recent', 'spent', 'orders'] as const;
const sortOf = (v?: string) => (SORTS as readonly string[]).includes(v ?? '') ? (v as (typeof SORTS)[number]) : undefined;

@ApiTags('portal-customer')
@ApiBearerAuth()
@Controller('portal/customers')
export class PortalCustomerController {
  constructor(private portalCustomerService: PortalCustomerService) {}

  @Get()
  list(
    @ShopId() shopId: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.portalCustomerService.list(shopId, {
      search,
      sort: sortOf(sort),
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  // Owner-only: the whole customer list in one file. Declared before ':key'.
  @Roles('OWNER')
  @Get('export-csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@ShopId() shopId: string, @Query('search') search?: string, @Query('sort') sort?: string) {
    return toCsv(await this.portalCustomerService.exportRows(shopId, { search, sort: sortOf(sort) }), CUSTOMER_CSV_COLUMNS);
  }

  @Get(':key')
  get(@ShopId() shopId: string, @Param('key') key: string) {
    return this.portalCustomerService.get(shopId, key);
  }
}
