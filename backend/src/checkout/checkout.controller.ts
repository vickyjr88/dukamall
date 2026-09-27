import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './checkout.dto';
import { Public } from '../auth/decorators/public.decorator';
import { ShopId } from '../common/shop-context';
import { OptionalCustomer } from '../customer-auth/optional-customer.decorator';

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private checkoutService: CheckoutService) {}

  @Public()
  @Post()
  start(@ShopId() shopId: string, @Body() dto: CheckoutDto, @OptionalCustomer() customerId: string | null) {
    return this.checkoutService.start(shopId, dto, customerId);
  }

  @Public()
  @Get(':orderId/verify')
  verify(@ShopId() shopId: string, @Param('orderId') orderId: string) {
    return this.checkoutService.verify(shopId, orderId);
  }
}
