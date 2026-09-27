import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomerAccountService } from './customer-account.service';
import { CustomerJwtGuard } from '../customer-auth/customer-jwt.guard';
import { CurrentCustomer } from '../customer-auth/current-customer.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ShopId } from '../common/shop-context';

/**
 * "My account" routes for a logged-in shopper -- order history and
 * favorites. Every handler here is @Public() (so the staff-only global
 * JwtAuthGuard doesn't reject a customer's token before this runs) AND
 * guarded by CustomerJwtGuard (so it still requires a valid customer
 * session) -- see that guard's own header comment for why the two auth
 * paths can't share one strategy.
 */
@ApiTags('customer-account')
@Controller('account')
@Public()
@UseGuards(CustomerJwtGuard)
export class CustomerAccountController {
  constructor(private accountService: CustomerAccountService) {}

  @Get('me')
  getProfile(@CurrentCustomer() customerId: string) {
    return this.accountService.getProfile(customerId);
  }

  @Get('orders')
  listOrders(@CurrentCustomer() customerId: string) {
    return this.accountService.listOrders(customerId);
  }

  @Get('orders/:orderId')
  getOrder(@CurrentCustomer() customerId: string, @Param('orderId') orderId: string) {
    return this.accountService.getOrder(customerId, orderId);
  }

  @Get('favorites')
  listFavorites(@CurrentCustomer() customerId: string) {
    return this.accountService.listFavorites(customerId);
  }

  @Post('favorites/:productId')
  addFavorite(@ShopId() shopId: string, @CurrentCustomer() customerId: string, @Param('productId') productId: string) {
    return this.accountService.addFavorite(shopId, customerId, productId);
  }

  @Delete('favorites/:productId')
  removeFavorite(@CurrentCustomer() customerId: string, @Param('productId') productId: string) {
    return this.accountService.removeFavorite(customerId, productId);
  }
}
