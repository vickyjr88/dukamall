import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { NoShopScope } from './decorators/no-shop-scope.decorator';

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
}
