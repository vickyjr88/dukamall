import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PlatformSettingsService } from './platform-settings.service';
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';

class UpdateSmtpSettingsDto {
  @IsOptional() @IsString() smtpHost?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) smtpPort?: number;
  @IsOptional() @IsString() smtpUser?: string;
  @IsOptional() @IsString() smtpPassword?: string;
  @IsOptional() @IsString() smtpFrom?: string;
  @IsOptional() @IsBoolean() smtpSecure?: boolean;
}

// Same guard stack as AdminController -- see that controller's own header
// comment for why @Public + @NoShopScope + AdminJwtGuard are needed
// together. Kept as its own small controller/module (not folded into
// AdminController) since SMTP config is a platform-wide identity, not a
// per-shop operation like everything else there.
@ApiTags('platform-settings')
@Controller('admin/platform-settings')
@Public()
@NoShopScope()
@UseGuards(AdminJwtGuard)
export class PlatformSettingsController {
  constructor(private platformSettingsService: PlatformSettingsService) {}

  @Get('smtp')
  getSmtp() {
    return this.platformSettingsService.getSmtpSettings();
  }

  @Put('smtp')
  updateSmtp(@Body() dto: UpdateSmtpSettingsDto) {
    return this.platformSettingsService.updateSmtpSettings(dto);
  }
}
