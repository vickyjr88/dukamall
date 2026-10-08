import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from './decorators/public.decorator';
import { NoShopScope } from './decorators/no-shop-scope.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { RateLimit } from '../common/rate-limit.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // The portal login form has no domain-resolved shop (staff aren't visiting
  // a shop's own storefront domain) -- shopSlug in the body is how this
  // route finds its own shop, so it can't require x-shop-id up front.
  @Public()
  @NoShopScope()
  @RateLimit(10, 60)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Who the caller is and what role they hold in this shop RIGHT NOW (a live
  // read, not the token's claim). The portal uses it to hide what the caller
  // can't do; the API enforces the same limits regardless (see RolesGuard).
  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: { id: string; email: string; firstName: string; lastName: string; shopId: string; role: string }) {
    return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, shopId: user.shopId, role: user.role };
  }

  // Not @Public(): the global JwtAuthGuard already requires a valid staff
  // token and populates @CurrentUser() from it -- see jwt.strategy.ts.
  @ApiBearerAuth()
  @Post('change-password')
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }
}
