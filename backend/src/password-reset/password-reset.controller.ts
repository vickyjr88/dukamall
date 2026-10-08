import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsUrl } from 'class-validator';
import { PasswordResetService } from './password-reset.service';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';
import { ShopId } from '../common/shop-context';
import { RateLimit } from '../common/rate-limit.decorator';

class RequestStaffResetDto {
  @IsEmail() email!: string;
  // http(s) only, since this becomes a clickable link in an email --
  // require_tld: false so a local dev origin like http://localhost:3202
  // still validates.
  @IsUrl({ require_tld: false }) originBaseUrl!: string;
}

class RequestCustomerResetDto {
  @IsEmail() email!: string;
}

class ConfirmResetDto {
  @IsString() token!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

// Staff/admin request has no shop context (a global User lookup by email),
// so it's @NoShopScope() same as onboarding/domain-resolution routes.
// Customer request and the shared confirm step ARE shop-scoped /
// unscoped respectively as commented on each handler.
@ApiTags('password-reset')
@Controller('password-reset')
export class PasswordResetController {
  constructor(private passwordResetService: PasswordResetService) {}

  @Public()
  @NoShopScope()
  @RateLimit(5, 600)
  @Post('staff/request')
  requestStaffReset(@Body() dto: RequestStaffResetDto) {
    return this.passwordResetService.requestStaffReset(dto.email, dto.originBaseUrl);
  }

  // Shop-scoped like every other customer-auth route -- x-shop-id (set by
  // web/middleware.ts) tells this which shop's Customer table to look in.
  @Public()
  @RateLimit(5, 600)
  @Post('customer/request')
  requestCustomerReset(@ShopId() shopId: string, @Body() dto: RequestCustomerResetDto) {
    return this.passwordResetService.requestCustomerReset(shopId, dto.email);
  }

  // No shop context needed: the token itself resolves to exactly one
  // account (see PasswordResetService.confirm), so this works from either
  // the portal's or a storefront's reset-password page without the caller
  // supplying which shop it's for.
  @Public()
  @NoShopScope()
  @RateLimit(10, 600)
  @Post('confirm')
  confirm(@Body() dto: ConfirmResetDto) {
    return this.passwordResetService.confirm(dto.token, dto.newPassword);
  }
}
