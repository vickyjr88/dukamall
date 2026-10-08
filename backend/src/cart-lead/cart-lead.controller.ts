import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CartLeadService } from './cart-lead.service';
import { RecordCartLeadDto } from './cart-lead.dto';
import { Public } from '../auth/decorators/public.decorator';
import { ShopId } from '../common/shop-context';
import { RateLimit } from '../common/rate-limit.decorator';

@ApiTags('cart-lead')
@Controller('cart-leads')
export class CartLeadController {
  constructor(private cartLeadService: CartLeadService) {}

  @Public()
  @RateLimit(20, 60)
  @Post()
  record(@ShopId() shopId: string, @Body() dto: RecordCartLeadDto) {
    return this.cartLeadService.record(shopId, dto);
  }
}

// Separate controller/path (not @Public(), so it sits behind the global
// staff JwtAuthGuard) -- a merchant's own read-only view of their leads,
// distinct from the write-only public capture endpoint above.
@ApiTags('cart-lead')
@ApiBearerAuth()
@Controller('portal/cart-leads')
export class PortalCartLeadController {
  constructor(private cartLeadService: CartLeadService) {}

  @Get()
  list(@ShopId() shopId: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.cartLeadService.list(shopId, page ? Number(page) : undefined, pageSize ? Number(pageSize) : undefined);
  }
}
