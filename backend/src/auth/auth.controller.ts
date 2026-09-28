import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from './decorators/public.decorator';
import { NoShopScope } from './decorators/no-shop-scope.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // The portal login form has no domain-resolved shop (staff aren't visiting
  // a shop's own storefront domain) -- shopSlug in the body is how this
  // route finds its own shop, so it can't require x-shop-id up front.
  @Public()
  @NoShopScope()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Not @Public(): the global JwtAuthGuard already requires a valid staff
  // token and populates @CurrentUser() from it -- see jwt.strategy.ts.
  @ApiBearerAuth()
  @Post('change-password')
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }
}
