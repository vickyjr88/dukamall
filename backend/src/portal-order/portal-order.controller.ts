import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { PortalOrderService } from './portal-order.service';
import { ShopId } from '../common/shop-context';

class UpdateOrderStatusDto {
  @IsIn(['PENDING', 'PAID', 'CANCELLED']) status!: OrderStatus;
}

@ApiTags('portal-order')
@ApiBearerAuth()
@Controller('portal/orders')
export class PortalOrderController {
  constructor(private portalOrderService: PortalOrderService) {}

  @Get()
  list(
    @ShopId() shopId: string,
    @Query('status') status?: OrderStatus,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.portalOrderService.list(shopId, {
      status,
      search,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  get(@ShopId() shopId: string, @Param('id') id: string) {
    return this.portalOrderService.get(shopId, id);
  }

  @Patch(':id/status')
  setStatus(@ShopId() shopId: string, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.portalOrderService.setStatus(shopId, id, dto.status);
  }
}
