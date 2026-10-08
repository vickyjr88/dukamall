import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtGuard } from './admin-jwt.guard';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';
import { RateLimit } from '../common/rate-limit.decorator';

class AdminLoginDto {
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() password!: string;
}

class VerifyTwoFactorDto {
  @IsString() @IsNotEmpty() challengeToken!: string;
  @IsOptional() @IsString() @Length(6, 8) code?: string;
  @IsOptional() @IsString() @Length(8, 20) recoveryCode?: string;
}

class CodeDto {
  @IsString() @Length(6, 8) code!: string;
}

class DisableDto {
  @IsString() @IsNotEmpty() password!: string;
  @IsOptional() @IsString() @Length(6, 8) code?: string;
  @IsOptional() @IsString() @Length(8, 20) recoveryCode?: string;
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

  // Second step for an account with two-factor sign-in on.
  @Public()
  @NoShopScope()
  @RateLimit(10, 60)
  @Post('verify-2fa')
  verifyTwoFactor(@Body() dto: VerifyTwoFactorDto) {
    return this.adminAuthService.verifyTwoFactor(dto.challengeToken, dto.code, dto.recoveryCode);
  }

  // Managing your own two-factor setup. These routes stay reachable even when
  // ADMIN_REQUIRE_2FA is on and you haven't enrolled yet (see AdminJwtGuard).
  @Public() @NoShopScope() @UseGuards(AdminJwtGuard)
  @Get('2fa/status')
  status(@Req() req: any) {
    return this.adminAuthService.twoFactorStatus(req.adminId);
  }

  @Public() @NoShopScope() @UseGuards(AdminJwtGuard)
  @Post('2fa/setup')
  setup(@Req() req: any) {
    return this.adminAuthService.beginSetup(req.adminId);
  }

  @Public() @NoShopScope() @UseGuards(AdminJwtGuard) @RateLimit(10, 60)
  @Post('2fa/enable')
  enable(@Req() req: any, @Body() dto: CodeDto) {
    return this.adminAuthService.enable(req.adminId, dto.code);
  }

  @Public() @NoShopScope() @UseGuards(AdminJwtGuard) @RateLimit(10, 60)
  @Post('2fa/disable')
  disable(@Req() req: any, @Body() dto: DisableDto) {
    return this.adminAuthService.disable(req.adminId, dto.password, dto.code, dto.recoveryCode);
  }

  @Public() @NoShopScope() @UseGuards(AdminJwtGuard) @RateLimit(10, 60)
  @Post('2fa/recovery-codes')
  recoveryCodes(@Req() req: any, @Body() dto: CodeDto) {
    return this.adminAuthService.regenerateRecoveryCodes(req.adminId, dto.code);
  }
}
