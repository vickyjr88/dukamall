import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { AdminAuthService } from './admin-auth.service';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';
import { RateLimit } from '../common/rate-limit.decorator';

class AdminLoginDto {
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() password!: string;
}

@ApiTags('admin-auth')
@Controller('admin-auth')
export class AdminAuthController {
  constructor(private adminAuthService: AdminAuthService) {}

  // No shop context exists for an admin login at all -- this is the
  // platform-operator equivalent of the staff login's shopSlug field, minus
  // the shop.
  @Public()
  @NoShopScope()
  @RateLimit(10, 60)
  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto.email, dto.password);
  }
}
