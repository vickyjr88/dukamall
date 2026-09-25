import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CartLeadService } from './cart-lead.service';
import { RecordCartLeadDto } from './cart-lead.dto';
import { Public } from '../auth/decorators/public.decorator';
import { ShopId } from '../common/shop-context';

@ApiTags('cart-lead')
@Controller('cart-leads')
export class CartLeadController {
  constructor(private cartLeadService: CartLeadService) {}

  @Public()
  @Post()
  record(@ShopId() shopId: string, @Body() dto: RecordCartLeadDto) {
    return this.cartLeadService.record(shopId, dto);
  }
}
